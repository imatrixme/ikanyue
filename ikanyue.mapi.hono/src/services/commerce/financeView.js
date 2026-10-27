async function financeView(checkout) {
    const summary = await checkout.gateway.request('/v1/finance');
    const rows = await checkout.repo.list('commerce_orders', { sort: '-created' });
    const people = new Map();
    const orders = new Map(rows.map((row) => [row.id, row]));
    for (const row of rows) {
        if (!people.has(row.studentId)) {
            const student = await checkout.repo.get('students', row.studentId);
            people.set(row.studentId, { name: student.realName || student.nickName || '未填写姓名', cellphone: student.cellphone });
        }
    }
    const payments = summary.payments.map((payment) => {
        const row = orders.get(payment.reference);
        return { ...payment, name: row?.data.name || '待核对订单', student: people.get(row?.studentId) || null,
            fulfillment: row?.status || 'unmatched' };
    });
    const refunds = [];
    const businessRefunds = await checkout.repo.list('commerce_refunds');
    for (const refund of summary.refunds) {
        const payment = payments.find((item) => item.id === refund.paymentId);
        const source = businessRefunds.find((row) => row.data.gatewayId === refund.id);
        refunds.push({ id: refund.id, reference: source?.id || refund.reference, amount: refund.amount, status: refund.status,
            createdAt: refund.createdAt, name: payment?.name || '待核对订单', student: payment?.student || null });
    }
    return { ...summary, payments, refunds, mockEnabled: checkout.gateway.mockEnabled };
}
module.exports = { financeView };
