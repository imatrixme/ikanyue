const { invariant } = require('../courseCredits/domain');
const { create } = require('../courseCredits/reservationRequests');
const { id, escape, commerceUpdate } = require('./planning');
const { validateReason } = require('./operations');

class CommerceCases {
    constructor(operations) { this.ops = operations; this.repo = operations.repo; }
    async list() {
        const [orders, refunds, finance, cases] = await Promise.all([
            this.repo.list('commerce_orders', { filter: 'status!="completed"' }),
            this.repo.list('commerce_refunds', { filter: 'status!="succeeded"' }),
            this.ops.checkout.gateway.request('/v1/finance'), this.repo.list('commerce_cases'),
        ]);
        const results = [];
        const add = (subjectId, orderId, kind, label, at, evidence) => {
            const record = cases.find((row) => row.subjectId === subjectId);
            results.push({ id: subjectId, orderId, kind, label, createdAt: at, evidence, status: record?.status || 'open', note: record?.data.note || '' });
        };
        const old = (at) => Date.now() - Date.parse(at) >= 15 * 60000;
        for (const order of orders) if (order.status === 'granting' || old(order.data.createdAt)) {
            add(`order:${order.id}`, order.id, 'order', order.status === 'granting' ? '收款后课时未到账' : '订单长期未完成', order.data.createdAt);
        }
        for (const refund of refunds) if (refund.status === 'failed' || old(refund.data.createdAt)) {
            add(`refund:${refund.id}`, refund.orderId, 'refund', refund.status === 'failed' ? '退款失败，需核实后重新申请' : '退款长期处理中', refund.data.createdAt);
        }
        for (const finding of finance.findings || []) {
            const payment = finance.payments.find((item) => item.id === finding.data.targetId);
            const refund = finance.refunds.find((item) => item.id === finding.data.targetId);
            const related = payment || finance.payments.find((item) => item.id === refund?.paymentId);
            add(`gateway:${finding.id}`, related?.reference || '', 'gateway', '渠道核对异常', finding.data.occurredAt, finding.data);
        }
        for (const record of cases) if (!results.some((item) => item.id === record.subjectId) && record.data.item) {
            results.push({ ...record.data.item, status: record.status, note: record.data.note });
        }
        const details = new Map();
        for (const item of results) if (item.orderId) {
            if (!details.has(item.orderId)) {
                const order = await this.repo.findFirst('commerce_orders', `id="${escape(item.orderId)}"`);
                details.set(item.orderId, order ? { student: await this.ops.person(order.studentId), orderName: order.data.name, amount: order.data.amount } : {});
            }
            Object.assign(item, details.get(item.orderId));
        }
        return results.sort((a, b) => a.status.localeCompare(b.status) || b.createdAt.localeCompare(a.createdAt));
    }
    async update(subjectId, input, user) {
        const note = validateReason(input.note);
        invariant(['open', 'resolved'].includes(input.status), 'INVALID_CASE_STATUS', '处理状态无效');
        const item = (await this.list()).find((row) => row.id === subjectId);
        invariant(item, 'CASE_NOT_FOUND', '异常记录不存在');
        if (input.status === 'resolved') {
            if (item.kind === 'order') {
                const row = await this.repo.get('commerce_orders', item.orderId);
                invariant(row.status === 'completed' || row.status === 'failed', 'CASE_STILL_UNRESOLVED', '订单尚未完成处理');
            }
            if (item.kind === 'refund') {
                const row = await this.repo.get('commerce_refunds', subjectId.slice(7));
                invariant(row.status !== 'processing' && !(row.data.kind === 'reservation' && row.status !== 'succeeded'),
                    'CASE_STILL_UNRESOLVED', '退款尚未完成，不能关闭待退款项');
            }
            if (item.kind === 'gateway') {
                const result = await this.ops.checkout.gateway.request('/v1/reconciliation', 'POST', {});
                invariant(!result.findings.some((finding) => finding.targetId === item.evidence?.targetId),
                    'CASE_STILL_UNRESOLVED', '当前仍存在渠道差异');
                const payment = financeEntity(await this.ops.checkout.gateway.request('/v1/finance'), item.evidence?.targetId);
                const work = (await this.ops.checkout.gateway.request('/v1/work')).items.filter((row) => row.data.targetId === item.evidence?.targetId);
                invariant(work.every((row) => !row.data.exhausted && !row.data.lastError), 'CASE_STILL_UNRESOLVED', '自动恢复任务仍需处理');
                invariant(payment ? ['succeeded', 'failed', 'closed'].includes(payment.status) : work.length > 0 && work.every((row) => row.data.done),
                    'CASE_STILL_UNRESOLVED', '渠道结果仍未确定');
            }
        }
        const row = await this.repo.findFirst('commerce_cases', `subjectId="${escape(subjectId)}"`);
        const caseId = id('case', subjectId); const at = new Date().toISOString();
        const data = { note, actorId: user.id, at, item };
        await this.repo.send([...(row ? commerceUpdate('commerce_cases', row, { status: input.status, data })
            : [create('commerce_cases', { id: caseId, subjectId, status: input.status, version: 1, data })]),
        create('commerce_audit', { id: id('case-audit', caseId, (row?.version || 0) + 1), subjectId: item.orderId || subjectId,
            actorId: user.id, action: 'exception_reviewed', data: { reason: note, status: input.status, createdAt: at } })]);
        return { status: input.status };
    }
}
function financeEntity(finance, targetId) { return [...finance.payments, ...finance.refunds].find((row) => row.id === targetId); }
module.exports = { CommerceCases };
