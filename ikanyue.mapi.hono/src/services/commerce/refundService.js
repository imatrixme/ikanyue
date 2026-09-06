const { invariant } = require('../courseCredits/domain');
const { balanceSnapshot } = require('../courseCredits/grantService');
const { create, update, versionClaim } = require('../courseCredits/reservationRequests');
const { id, escape, commerceUpdate, auditOperation } = require('./planning');
const { pendingCount } = require('./reservationCancellation');

class CommerceRefundService {
    constructor(checkout) { this.checkout = checkout; this.repo = checkout.repo; this.gateway = checkout.gateway; }

    async preview(studentId, orderId) {
        const transaction = await this.checkout.owned(studentId, orderId);
        const order = await this.repo.get('orders', orderId);
        invariant(order.productSnapshot?.origin === 'gateway', 'OFFLINE_REFUND_MANUAL_ONLY', '历史线下款项需要人工核对');
        invariant(transaction.status === 'completed' && !transaction.data.refundPending,
            'REFUND_NOT_READY', '订单尚未完成或已有退款正在处理');
        const batches = [];
        for (const grant of transaction.data.grantResult?.batches || []) {
            const batch = await this.repo.get('credit_batches', grant.batchId);
            invariant(batch.studentId === studentId && batch.sourceOperationId === transaction.data.grantResult.operationId,
                'REFUND_BATCH_MISMATCH', '课时来源不一致，需要人工核对');
            batches.push(batch);
        }
        invariant(batches.length > 0, 'REFUND_BATCH_MISSING', '尚未查到可核对的课时');
        const blocked = batches.some((batch) => batch.frozenQuantity > 0);
        const lines = batches.map((batch) => {
            const allocation = transaction.data.allocations.find((line) => line.creditTypeId === batch.creditTypeId);
            invariant(allocation && allocation.quantity === batch.originalQuantity, 'REFUND_ALLOCATION_MISMATCH', '金额分摊需要人工核对');
            return { batchId: batch.id, quantity: batch.availableQuantity,
                amount: Math.floor(allocation.paidMinor * batch.availableQuantity / allocation.quantity) };
        });
        const amount = Math.min(transaction.data.amount - transaction.data.refunded,
            lines.reduce((sum, line) => sum + line.amount, 0));
        return { amount: Math.max(0, amount), currency: 'CNY', lines,
            blocked, message: blocked ? '请先处理已预约课程，再退剩余课时' : '按购买时的实付金额退还未使用部分',
            transaction, order, batches };
    }

    async request(studentId, orderId, key, expectedAmount, actor) {
        invariant(typeof key === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(key), 'REFUND_KEY_REQUIRED', '请重新提交退款申请');
        invariant(Number.isSafeInteger(expectedAmount) && expectedAmount > 0, 'REFUND_QUOTE_REQUIRED', '请先确认预计退款金额');
        const refundId = id('commerce-refund', studentId, orderId, key);
        const existing = await this.repo.findFirst('commerce_refunds', `id="${refundId}"`);
        if (existing) invariant(existing.data.amount === expectedAmount
            && (!actor || (existing.data.actor?.id === actor.id && existing.data.actor?.reason === actor.reason)),
        'REFUND_REQUEST_CONFLICT', '退款申请与原请求不一致');
        if (!existing) {
            const quote = await this.preview(studentId, orderId);
            invariant(!quote.blocked, 'REFUND_HAS_RESERVATIONS', quote.message);
            invariant(quote.amount > 0, 'NO_REFUNDABLE_AMOUNT', '当前没有可退金额');
            invariant(quote.amount === expectedAmount, 'REFUND_QUOTE_CHANGED', '可退金额已变化，请重新确认');
            const operationId = id('refund-withdraw', refundId);
            const at = new Date(this.checkout.clock()).toISOString();
            const held = quote.batches.filter((batch) => batch.availableQuantity > 0)
                .map((batch) => ({ id: batch.id, quantity: batch.availableQuantity, status: batch.status }));
            const plan = [auditOperation(operationId, quote.order, actor?.reason || 'refund_entitlements_withdrawn', at, actor),
                create('commerce_refunds', { id: refundId, orderId, studentId, status: 'processing', version: 1,
                    data: { amount: quote.amount, gatewayId: '', held, createdAt: at,
                        actor: actor || { id: studentId, role: 'student', reason: '退还剩余课时' } } }),
                ...commerceUpdate('commerce_orders', quote.transaction, {
                    data: { ...quote.transaction.data, refundPending: true, pendingRefundCount: 1, refundReservedAmount: quote.amount },
                })];
            if (actor) plan.push(create('commerce_audit', { id: id('refund-audit', refundId), subjectId: orderId,
                actorId: actor.id, action: 'refund_requested', data: { reason: actor.reason, refundId,
                    amount: quote.amount, role: actor.role, createdAt: at } }));
            for (const batch of quote.batches.filter((row) => row.availableQuantity > 0)) {
                plan.push(...this.movement(batch, operationId, at, batch.availableQuantity, false, undefined, actor));
            }
            try { await this.repo.send(plan); }
            catch (error) {
                const replay = await this.repo.findFirst('commerce_refunds', `id="${refundId}"`);
                if (!replay || replay.data.amount !== expectedAmount
                    || (actor && (replay.data.actor?.id !== actor.id || replay.data.actor?.reason !== actor.reason))) throw error;
            }
        }
        await this.sync(refundId);
        return this.detail(studentId, refundId);
    }

    movement(batch, operationId, at, quantity, restore, originalStatus, actor) {
        const expired = restore && batch.effectiveExpiresAt && Date.parse(batch.effectiveExpiresAt) <= Date.parse(at);
        const target = expired ? 'expiredQuantity' : 'availableQuantity';
        const next = { ...batch, version: batch.version + 1 };
        if (restore) {
            invariant(batch.reversedQuantity >= quantity, 'REFUND_RESTORE_CONFLICT', '退款课时恢复需要人工核对');
            next.reversedQuantity -= quantity; next[target] = (next[target] || 0) + quantity;
            next.status = expired ? 'expired' : originalStatus;
        } else {
            next.availableQuantity -= quantity; next.reversedQuantity = (next.reversedQuantity || 0) + quantity;
            next.status = 'cancelled';
        }
        return [versionClaim(() => id('batch-claim', batch.id, batch.version), 'credit_batch', batch.id, batch.version, operationId),
            update('credit_batches', batch.id, { availableQuantity: next.availableQuantity,
                expiredQuantity: next.expiredQuantity || 0, reversedQuantity: next.reversedQuantity,
                status: next.status, version: next.version }),
            create('credit_events', { id: id('refund-event', operationId, batch.id), operationId, batchId: batch.id,
                studentId: batch.studentId, creditTypeId: batch.creditTypeId,
                eventType: restore ? 'ADJUST' : 'REVERSE', quantityDelta: restore ? quantity : -quantity,
                bucketFrom: restore ? 'reversedQuantity' : 'availableQuantity',
                bucketTo: restore ? target : 'reversedQuantity', balanceSnapshot: balanceSnapshot(next),
                businessTime: at, actorId: actor?.id || batch.studentId, reason: actor?.reason || (restore ? '退款失败，恢复课程权益' : '申请退款，暂停剩余课程权益'),
                metadata: { source: 'commerce_refund', pendingWithdrawal: !restore } })];
    }

    async sync(refundId) {
        let refund = await this.repo.get('commerce_refunds', refundId);
        if (refund.status !== 'processing') return;
        let transaction = await this.repo.get('commerce_orders', refund.orderId);
        let response;
        if (!refund.data.gatewayId) {
            response = await this.gateway.refund(refund.data.gatewayReference || refundId, transaction.data.paymentId, refund.data.amount);
            await this.repo.send(commerceUpdate('commerce_refunds', refund, {
                data: { ...refund.data, gatewayId: response.id },
            }));
            refund = await this.repo.get('commerce_refunds', refundId);
        } else response = await this.gateway.refundStatus(refund.data.gatewayId);
        invariant(response.reference === (refund.data.gatewayReference || refundId) && response.amount === refund.data.amount
            && response.paymentId === transaction.data.paymentId, 'REFUND_RECEIPT_MISMATCH', '退款结果需要核对');
        if (!['succeeded', 'failed'].includes(response.status)) return;
        const order = await this.repo.get('orders', refund.orderId);
        transaction = await this.repo.get('commerce_orders', refund.orderId);
        const operationId = id('refund-finalize', refundId, refund.data.attempt || 0);
        const at = new Date(this.checkout.clock()).toISOString();
        const liability = refund.data.kind === 'reservation' && response.status === 'failed';
        const pending = Math.max(0, pendingCount(transaction.data) - (liability ? 0 : 1));
        const plan = [auditOperation(operationId, order, `gateway_refund_${response.status}`, at),
            ...commerceUpdate('commerce_refunds', refund, { status: response.status }),
            ...commerceUpdate('commerce_orders', transaction, { data: { ...transaction.data, refundPending: pending > 0,
                pendingRefundCount: pending,
                refundReservedAmount: Math.max(0, (transaction.data.refundReservedAmount ?? refund.data.amount) - (liability ? 0 : refund.data.amount)),
                refunded: transaction.data.refunded + (response.status === 'succeeded' ? refund.data.amount : 0) } })];
        if (response.status === 'succeeded') {
            plan.push(create('payment_events', { id: id('refund-payment-event', refundId), orderId: order.id,
                providerEventId: `gateway-refund:${response.id}`, type: 'refunded', amount: refund.data.amount / 100,
                payloadHash: id(response.id, response.amount) }));
        } else if (!liability) {
            for (const held of refund.data.held) {
                const batch = await this.repo.get('credit_batches', held.id);
                plan.push(...this.movement(batch, operationId, at, held.quantity, true, held.status));
            }
        }
        await this.repo.send(plan);
    }
    async retryLiability(refundId, actor) {
        const refund = await this.repo.get('commerce_refunds', refundId);
        invariant(refund.status === 'failed' && refund.data.kind === 'reservation',
            'REFUND_RETRY_NOT_ALLOWED', '只有已确认失败的预约退款可以重试');
        const attempt = (refund.data.attempt || 0) + 1;
        await this.repo.send([...commerceUpdate('commerce_refunds', refund, { status: 'processing', data: {
            ...refund.data, attempt, gatewayId: '', gatewayReference: id('refund-retry', refundId, attempt),
        } }), create('commerce_audit', { id: id('refund-retry-audit', refundId, attempt), subjectId: refund.orderId,
            actorId: actor.id, action: 'refund_retried', data: { reason: actor.reason, refundId, createdAt: new Date(this.checkout.clock()).toISOString() } })]);
        await this.sync(refundId);
        return this.detail(refund.studentId, refundId);
    }
    async detail(studentId, refundId) {
        const row = await this.repo.get('commerce_refunds', refundId);
        invariant(row.studentId === studentId, 'COMMERCE_ORDER_FORBIDDEN', '不能查看其他学员的退款');
        return { id: row.id, orderId: row.orderId, amount: row.data.amount, status: row.status, createdAt: row.data.createdAt };
    }
    async recover() {
        const rows = await this.repo.list('commerce_refunds', { filter: 'status="processing"', sort: 'created' });
        let failed = 0;
        for (const row of rows) { try { await this.sync(row.id); } catch { failed++; } }
        const events = await this.gateway.request('/v1/events');
        for (const event of events.items || []) {
            if (!event.data.type.startsWith('refund.')) continue;
            const reference = escape(event.data.payload.reference);
            const row = await this.repo.findFirst('commerce_refunds', `(id="${reference}" || data.gatewayReference="${reference}")`);
            if (row && row.data.gatewayId === event.data.targetId && row.status !== 'processing') {
                await this.gateway.request(`/v1/events/${event.id}/ack`, 'POST', {});
            }
        }
        return { inspected: rows.length, unresolved: failed };
    }
}

module.exports = { CommerceRefundService };
