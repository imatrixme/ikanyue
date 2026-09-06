const { invariant } = require('../courseCredits/domain');
const { id, escape } = require('./planning');
const { create } = require('../courseCredits/reservationRequests');

class CommerceOperations {
    constructor(checkout, refunds) { this.checkout = checkout; this.refunds = refunds; this.repo = checkout.repo; }
    async person(studentId) {
        const row = await this.repo.get('students', studentId);
        return { id: row.id, name: row.realName || row.nickName || '未填写姓名', cellphone: row.cellphone || '' };
    }
    async orders(query = {}) {
        const page = Number(query.page || 1); const perPage = Number(query.perPage || 20);
        invariant(Number.isInteger(page) && page > 0 && Number.isInteger(perPage) && perPage > 0 && perPage <= 100,
            'INVALID_PAGINATION', '分页参数无效');
        const filters = [];
        const search = String(query.search || '').trim();
        invariant(search.length <= 100, 'INVALID_SEARCH', '搜索内容过长');
        if (search) {
            const value = escape(search);
            filters.push(`(id~"${value}" || data.name~"${value}" || studentId.realName~"${value}" || studentId.nickName~"${value}" || studentId.cellphone~"${value}")`);
        }
        if (query.status) {
            invariant(['pending', 'granting', 'completed', 'failed', 'refunding'].includes(query.status), 'INVALID_ORDER_STATUS', '订单状态无效');
            filters.push(query.status === 'refunding' ? 'data.refundPending=true' : `status="${query.status}"`);
        }
        for (const [key, comparison] of [['from', '>='], ['to', '<=']]) if (query[key]) {
            invariant(/^\d{4}-\d{2}-\d{2}$/.test(query[key]) && Number.isFinite(Date.parse(query[key]))
                && new Date(query[key]).toISOString().slice(0, 10) === query[key], 'INVALID_DATE_FILTER', '日期无效');
            const boundary = new Date(`${query[key]}T${key === 'from' ? '00:00:00' : '23:59:59.999'}+08:00`).toISOString();
            filters.push(`created${comparison}"${boundary}"`);
        }
        invariant(!query.from || !query.to || query.from <= query.to, 'INVALID_DATE_FILTER', '结束日期不能早于开始日期');
        const result = await this.repo.page('commerce_orders', page, perPage, { filter: filters.join(' && '), sort: '-created,-id' });
        return { ...result, items: await Promise.all(result.items.map(async (row) => ({ ...this.checkout.present(row),
            student: await this.person(row.studentId), paymentId: row.data.paymentId || '' }))) };
    }
    async detail(orderId) {
        const row = await this.repo.get('commerce_orders', orderId);
        const batches = await Promise.all((row.data.grantResult?.batches || []).map(async (grant) => {
            const batch = await this.repo.get('credit_batches', grant.batchId);
            const type = await this.repo.get('credit_types', batch.creditTypeId);
            return { id: batch.id, name: type.name, original: batch.originalQuantity, available: batch.availableQuantity,
                reserved: batch.frozenQuantity, consumed: batch.consumedQuantity, expired: batch.expiredQuantity,
                reversed: batch.reversedQuantity, expiresAt: batch.effectiveExpiresAt };
        }));
        const refunds = await this.repo.list('commerce_refunds', { filter: `orderId="${escape(orderId)}"`, sort: '-created' });
        const audit = await this.repo.list('commerce_audit', { filter: `subjectId="${escape(orderId)}"`, sort: '-created' });
        let quote;
        try { quote = publicQuote(await this.refunds.preview(row.studentId, orderId)); }
        catch (error) { quote = { amount: 0, blocked: true, message: error.message, lines: [] }; }
        let payment = null; let paymentUnavailable = false;
        if (row.data.paymentId) {
            try { payment = await this.checkout.gateway.payment(row.data.paymentId); }
            catch { paymentUnavailable = true; }
        }
        return { ...this.checkout.present(row), student: await this.person(row.studentId), batches, quote, payment,
            paymentUnavailable, refunds: refunds.map((item) => ({ id: item.id, status: item.status, ...item.data, gatewayId: undefined, held: undefined })),
            audit: await Promise.all(audit.map(async (item) => ({ id: item.id, actorId: item.actorId, action: item.action,
                ...item.data, actorName: await this.actorName(item.actorId) }))) };
    }
    async actorName(actorId) {
        for (const collection of ['teachers', 'students']) {
            const person = await this.repo.findFirst(collection, `id="${escape(actorId)}"`);
            if (person) return person.realName || person.nickName || '未填写姓名';
        }
        return '历史操作人';
    }
    async refund(orderId, input, user) {
        const reason = validateReason(input.reason);
        invariant(typeof input.key === 'string' && /^[\w-]{1,100}$/.test(input.key), 'REFUND_KEY_REQUIRED', '请重新确认退款');
        const row = await this.repo.get('commerce_orders', orderId);
        return this.refunds.request(row.studentId, orderId, id('ops-refund', user.id, input.key), input.expectedAmount,
            { id: user.id, role: 'admin', reason });
    }
    async recoverOrder(orderId, input, user) {
        const reason = validateReason(input.reason);
        invariant(typeof input.key === 'string' && /^[\w-]{1,100}$/.test(input.key), 'RECOVERY_KEY_REQUIRED', '请重新提交同步请求');
        await this.repo.get('commerce_orders', orderId);
        const auditId = id('recover', orderId, user.id, input.key);
        const previous = await this.repo.findFirst('commerce_audit', `id="${auditId}"`);
        invariant(!previous || previous.data.reason === reason, 'RECOVERY_REQUEST_CONFLICT', '同步请求与原请求不一致');
        if (!previous) {
            try { await this.repo.send([create('commerce_audit', { id: auditId, subjectId: orderId, actorId: user.id,
                action: 'recovery_requested', data: { reason, createdAt: new Date().toISOString() } })]); }
            catch (error) {
                const replay = await this.repo.findFirst('commerce_audit', `id="${auditId}"`);
                if (!replay || replay.data.reason !== reason) throw error;
            }
        }
        await this.checkout.sync(orderId);
        const refunds = await this.repo.list('commerce_refunds', { filter: `orderId="${escape(orderId)}" && status="processing"` });
        for (const refund of refunds) await this.refunds.sync(refund.id);
        return this.detail(orderId);
    }
}
function publicQuote({ amount, currency, lines, blocked, message }) { return { amount, currency, lines, blocked, message }; }
function validateReason(reason) {
    invariant(typeof reason === 'string' && reason.trim().length >= 2 && reason.trim().length <= 500,
        'COMMERCE_REASON_REQUIRED', '请填写2至500字的处理原因');
    return reason.trim();
}
module.exports = { CommerceOperations, publicQuote, validateReason };
