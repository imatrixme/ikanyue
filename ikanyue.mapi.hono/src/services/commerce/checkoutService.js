const { invariant } = require('../courseCredits/domain');
const { buildGrantSnapshot, buildOrder, validateEnrollmentResources } = require('../courseCredits/enrollmentService');
const { create } = require('../courseCredits/reservationRequests');
const { id, escape, amountMinor, commerceUpdate, auditOperation, orderUpdate, validatePolicy, allocateMinor } = require('./planning');

class CheckoutService {
    constructor(services, gateway, clock = Date.now) {
        this.services = services; this.repo = services.repository; this.gateway = gateway; this.clock = clock;
    }
    async catalog() {
        const offers = await this.repo.list('commerce_offers', { filter: 'status="active"', sort: 'name' });
        const results = [];
        for (const offer of offers) {
            try {
                const details = await this.offer(offer.id);
                results.push({ id: offer.id, name: offer.name, amount: details.amount, currency: 'CNY',
                    policy: details.policy, quantity: details.lines.reduce((sum, line) => sum + line.quantity, 0),
                    validityDays: details.packageRecord.validityDurationDays });
            } catch (error) { if (!error.code && error.status !== 404) throw error; }
        }
        return results;
    }
    async offer(offerId, draft = false) {
        const offer = await this.repo.get('commerce_offers', offerId);
        invariant(offer.status === 'active' || (draft && offer.status === 'draft'), 'OFFER_UNAVAILABLE', '该课程暂不可购买');
        const packageRecord = await this.repo.get('packages', offer.packageId);
        const price = await this.repo.get('price_versions', offer.priceVersionId);
        validateEnrollmentResources(packageRecord, price, packageRecord.id, this.clock());
        invariant(['wechat', 'all'].includes(packageRecord.saleChannel) && price.currency === 'CNY',
            'OFFER_CHANNEL_UNAVAILABLE', '该课程尚未开放在线购买');
        const lines = await this.repo.list('package_grant_lines', { filter: `packageId="${escape(packageRecord.id)}"`, sort: 'id' });
        invariant(lines.length > 0 && lines.length <= 10, 'INVALID_GRANT_LINES', '课程内容尚未配置');
        invariant(new Set(lines.map((line) => line.creditTypeId)).size === lines.length, 'INVALID_GRANT_LINES', '同类课时必须合并为一项');
        const creditTypes = new Map();
        for (const line of lines) {
            const credit = await this.repo.get('credit_types', line.creditTypeId);
            invariant(credit.kind === 'course' && credit.status === 'active' && credit.consumable
                && Number.isInteger(line.quantity) && line.quantity > 0, 'INVALID_COURSE_OFFER', '课程内容暂不可购买');
            creditTypes.set(credit.id, credit);
        }
        const policy = validatePolicy(offer.policy);
        invariant(policy.reservationRefund === 'cash' || (policy.cancellationTiers.length === 1 && policy.cancellationTiers[0].beforeMinutes === 0
            && policy.cancellationTiers[0].feeBps === 0), 'COMMERCE_TIERED_CANCELLATION_NOT_ENABLED',
        '该课程的阶梯退费流程尚未开放，暂不能购买');
        return { offer, packageRecord, price, lines, creditTypes,
            amount: amountMinor(price.saleAmount), policy };
    }
    async checkout(studentId, input, identity) {
        invariant(typeof input.key === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(input.key),
            'CHECKOUT_KEY_REQUIRED', '请重新提交购买请求');
        const orderId = id('checkout', studentId, input.key);
        let transaction = await this.repo.findFirst('commerce_orders', `id="${orderId}"`);
        if (transaction) {
            invariant(transaction.data.offerId === input.offerId, 'CHECKOUT_CONFLICT', '购买请求与原订单不一致');
        } else {
            let payerId;
            if (!this.gateway.mockEnabled) {
                invariant(identity?.wechatOpenId && process.env.WECHAT_APPID, 'PAYMENT_WECHAT_IDENTITY_REQUIRED', '请先使用微信登录，再支付课程订单');
                const binding = await this.repo.findFirst('wechat_identities', `principalType="student" && principalId="${escape(studentId)}"`
                    + ` && appId="${escape(process.env.WECHAT_APPID)}" && openId="${escape(identity.wechatOpenId)}" && status="active"`);
                invariant(binding, 'PAYMENT_WECHAT_IDENTITY_REQUIRED', '微信支付身份已变化，请重新登录');
                payerId = binding.openId;
            }
            const details = await this.offer(input.offerId);
            const { packageRecord, price, lines, creditTypes, amount, policy } = details;
            const at = new Date(this.clock()).toISOString();
            const snapshot = buildGrantSnapshot(packageRecord, price, lines, creditTypes);
            if (policy.reservationRefund === 'cash') snapshot.lines.forEach((line) => { line.commerceOrderId = orderId; });
            const order = buildOrder({ at, grantSnapshot: snapshot, input: { studentId, channel: 'wechat' },
                orderId, packageRecord, price, scopedKey: `commerce:${orderId}` });
            order.status = 'pending'; order.paidAt = '';
            order.productSnapshot = { ...order.productSnapshot, policy, origin: 'gateway', paidMinor: amount };
            const data = { offerId: input.offerId, name: details.offer.name, amount, currency: 'CNY', policy, payerId,
                allocations: allocateMinor(amount, lines, creditTypes),
                paymentId: '', refunded: 0, refundPending: false, grantResult: null, createdAt: at };
            try {
                await this.repo.send([create('orders', order), create('commerce_orders', {
                    id: orderId, orderId, studentId, status: 'pending', version: 1, data,
                })]);
            } catch (error) {
                transaction = await this.repo.findFirst('commerce_orders', `id="${orderId}"`);
                if (!transaction || transaction.data.offerId !== input.offerId) throw error;
            }
        }
        await this.sync(orderId);
        return this.detail(studentId, orderId);
    }
    async sync(orderId) {
        let transaction = await this.repo.get('commerce_orders', orderId);
        let payment;
        if (!transaction.data.paymentId) {
            payment = await this.gateway.createPayment(orderId, transaction.data.amount, transaction.data.payerId, transaction.data.name);
            await this.repo.send(commerceUpdate('commerce_orders', transaction, {
                data: { ...transaction.data, paymentId: payment.id },
            }));
            transaction = await this.repo.get('commerce_orders', orderId);
        } else payment = await this.gateway.payment(transaction.data.paymentId);
        invariant(payment.reference === orderId && payment.amount === transaction.data.amount && payment.currency === 'CNY',
            'PAYMENT_RECEIPT_MISMATCH', '付款信息不一致，已暂停自动发课');
        if (transaction.status === 'completed') return;
        if (payment.status !== 'succeeded') {
            if (['failed', 'closed'].includes(payment.status) && transaction.status !== 'failed') {
                await this.repo.send(commerceUpdate('commerce_orders', transaction, { status: 'failed' }));
            }
            return;
        }
        let order = await this.repo.get('orders', orderId);
        if (order.status === 'pending') {
            const operationId = id('receipt', orderId);
            const at = new Date(this.clock()).toISOString();
            await this.repo.send([auditOperation(operationId, order, 'gateway_receipt', at),
                ...orderUpdate(order, operationId, { status: 'paid', paidAt: payment.paidAt || at }),
                create('payment_events', { id: id('payment_event', payment.id), orderId,
                    providerEventId: `gateway:${payment.id}`, type: 'paid', amount: payment.amount / 100,
                    payloadHash: id(payment.id, payment.amount, payment.currency) }),
                ...commerceUpdate('commerce_orders', transaction, { status: 'granting' })]);
        }
        order = await this.repo.get('orders', orderId);
        invariant(['paid', 'granted'].includes(order.status), 'ORDER_NOT_GRANTABLE', '订单状态需要核对');
        const result = await this.services.grantService.grantOrderCredits({ orderId,
            idempotencyKey: `commerce-grant-${orderId}`, actorId: 'gateway', actorRole: 'service' });
        transaction = await this.repo.get('commerce_orders', orderId);
        if (transaction.status !== 'completed') {
            await this.repo.send(commerceUpdate('commerce_orders', transaction, {
                status: 'completed', data: { ...transaction.data, grantResult: result },
            }));
        }
    }
    async owned(studentId, orderId) {
        const row = await this.repo.get('commerce_orders', orderId);
        invariant(row.studentId === studentId, 'COMMERCE_ORDER_FORBIDDEN', '不能操作其他学员的订单');
        return row;
    }
    async detail(studentId, orderId) {
        const row = await this.owned(studentId, orderId);
        const batches = await Promise.all((row.data.grantResult?.batches || []).map((item) => this.repo.get('credit_batches', item.batchId)));
        return { ...this.present(row), availableQuantity: batches.reduce((sum, batch) => sum + batch.availableQuantity, 0) };
    }
    async cashier(studentId, orderId, identity) {
        const row = await this.owned(studentId, orderId);
        invariant(row.status === 'pending' && row.data.paymentId, 'PAYMENT_NOT_READY', '当前订单无需再次付款');
        if (!this.gateway.mockEnabled) invariant(identity?.wechatOpenId && identity.wechatOpenId === row.data.payerId,
            'PAYMENT_WECHAT_IDENTITY_REQUIRED', '请使用下单时的微信身份支付');
        const payment = await this.gateway.refreshPayment(row.data.paymentId);
        if (payment.status !== 'pending') {
            await this.sync(orderId);
            invariant(false, 'PAYMENT_WINDOW_CLOSED', '订单已超过支付时间，请重新选购');
        }
        return payment.action;
    }
    present(row) {
        const { name, amount, currency, policy, refunded, refundPending, createdAt } = row.data;
        return { id: row.id, name, amount, currency, policy, refunded, refundPending, createdAt,
            cancellationFees: row.data.cancellationFees || 0,
            status: row.status, mockPayment: this.gateway.mockEnabled && row.status === 'pending' };
    }
    async list(studentId) {
        return (await this.repo.list('commerce_orders', { filter: `studentId="${escape(studentId)}"`, sort: '-created' }))
            .map((row) => this.present(row));
    }
    async mockPay(studentId, orderId) {
        const row = await this.owned(studentId, orderId);
        invariant(row.data.paymentId, 'PAYMENT_NOT_READY', '支付单正在准备');
        await this.gateway.mockSuccess(row.data.paymentId);
        await this.sync(orderId);
        return this.detail(studentId, orderId);
    }
    async recover() {
        const rows = await this.repo.list('commerce_orders', { filter: 'status!="completed"', sort: 'created' });
        let failed = 0;
        for (const row of rows) { try { await this.sync(row.id); } catch { failed++; } }
        const events = await this.gateway.request('/v1/events');
        for (const event of events.items || []) {
            if (!event.data.type.startsWith('payment.')) continue;
            const row = await this.repo.findFirst('commerce_orders', `id="${escape(event.data.payload.reference)}"`);
            const handled = event.data.payload.status === 'succeeded' ? row?.status === 'completed' : row?.status === 'failed';
            // Events for payments this service never created must not occupy the gateway's pending window.
            if (!row || (row.data.paymentId === event.data.targetId && handled)) {
                await this.gateway.request(`/v1/events/${event.id}/ack`, 'POST', {});
            }
        }
        return { inspected: rows.length, unresolved: failed };
    }
}

module.exports = { CheckoutService };
