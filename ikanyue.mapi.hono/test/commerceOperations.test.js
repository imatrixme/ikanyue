const test = require('node:test');
const assert = require('node:assert/strict');
const { CommerceOperations } = require('../src/services/commerce/operations');
const { registerEvents } = require('../src/routes/commerce/events');
const { previewReservation } = require('../src/services/commerce/reservationCancellation');
const { studentAppointment } = require('../src/services/courseCredits/booking/projection');

test('rescheduling preserves the student cancellation action', () => {
    assert.equal(studentAppointment({ status: 'rescheduled' }).canCancel, true);
    assert.equal(studentAppointment({ status: 'cancelled' }).canCancel, false);
});

test('order filters use China calendar days and reject invalid or reversed dates', async () => {
    let options;
    const repo = { page: async (_name, _page, _size, query) => { options = query; return { items: [] }; } };
    const service = new CommerceOperations({ repo }, {});
    await service.orders({ from: '2026-09-06', to: '2026-09-06' });
    assert.match(options.filter, /2026-09-05T16:00:00.000Z/);
    assert.match(options.filter, /2026-09-06T15:59:59.999Z/);
    await assert.rejects(service.orders({ from: '2026-02-30' }), { code: 'INVALID_DATE_FILTER' });
    await assert.rejects(service.orders({ from: '2026-09-06', to: '2026-09-05' }), { code: 'INVALID_DATE_FILTER' });
});
test('Admin refund forwards authenticated actor and trimmed reason, never client actor', async () => {
    let received;
    const service = new CommerceOperations({ repo: { get: async () => ({ studentId: 'student' }) } }, {
        request: async (...args) => { received = args; },
    });
    await service.refund('order', { key: 'key', expectedAmount: 12345, reason: ' 学员申请 ', actorId: 'spoofed' }, { id: 'operator' });
    assert.equal(received[0], 'student'); assert.equal(received[3], 12345);
    assert.deepEqual(received[4], { id: 'operator', role: 'admin', reason: '学员申请' });
    await assert.rejects(service.refund('order', { key: 'key', reason: '' }, { id: 'operator' }), { code: 'COMMERCE_REASON_REQUIRED' });
});
test('legacy cancellation preview needs no commerce collections or feature flag', async () => {
    const repo = {
        get: async (name) => {
            if (name === 'appointment_requests') return { studentId: 's', status: 'confirmed', sessionId: 'session' };
            if (name === 'credit_batches') return { grantSnapshot: {} };
            throw new Error(`Unexpected commerce access: ${name}`);
        },
        list: async (name) => name === 'session_students' ? [{ id: 'roster', creditStatus: 'reserved' }] : [{ batchId: 'batch', quantity: 1 }],
    };
    assert.equal((await previewReservation(repo, 's', 'appointment')).mode, 'credit');
    await assert.rejects(previewReservation(repo, 'other', 'appointment'), { code: 'APPOINTMENT_STUDENT_FORBIDDEN' });
});
test('configured payment events authenticate and reload trusted gateway state before acknowledging', async () => {
    let handler; let syncs = 0; let status = 'pending';
    const routes = { post: () => ({ handler: (value) => { handler = value; } }) };
    const token = 'e'.repeat(40);
    registerEvents(routes, async () => ({ checkout: { repo: { get: async () => ({ id: 'order', status, data: { paymentId: 'payment' } }) },
        sync: async () => { syncs++; } } }), { PAY_EVENT_TOKEN: token });
    const context = (authorization, body) => ({ req: { header: () => authorization, json: async () => body },
        json: (data, status) => ({ data, status }), body: (_data, status) => ({ status }) });
    const payload = { reference: 'order', targetId: 'payment', type: 'payment.succeeded' };
    assert.equal((await handler(context('', payload))).status, 401); assert.equal(syncs, 0);
    assert.equal((await handler(context(`Bearer ${token}`, { ...payload, targetId: 'other' }))).status, 409);
    assert.equal((await handler(context(`Bearer ${token}`, payload))).status, 503);
    status = 'completed'; assert.equal((await handler(context(`Bearer ${token}`, payload))).status, 204);
    assert.equal(syncs, 2);
});
