const { timingSafeEqual } = require('node:crypto');
const { escape } = require('../../services/commerce/planning');

function registerEvents(routes, load, env) {
    if (!env.PAY_EVENT_TOKEN || env.PAY_EVENT_TOKEN.length < 32) return;
    routes.post('/internal/commerce/payment-events').handler(async (c) => {
        const received = Buffer.from(c.req.header('Authorization') || '');
        const expected = Buffer.from(`Bearer ${env.PAY_EVENT_TOKEN}`);
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) return c.json({ error: 'UNAUTHORIZED' }, 401);
        try {
            const body = await c.req.json();
            if (!body || typeof body.reference !== 'string' || body.reference.length > 100) return c.json({ error: 'INVALID_EVENT' }, 400);
            const { checkout, refunds } = await load();
            if (String(body.type).startsWith('payment.')) {
                const row = await checkout.repo.get('commerce_orders', body.reference);
                if (row.data.paymentId !== body.targetId) return c.json({ error: 'EVENT_MISMATCH' }, 409);
                await checkout.sync(row.id);
                const updated = await checkout.repo.get('commerce_orders', row.id);
                if (!['completed', 'failed'].includes(updated.status)) return c.json({ error: 'FULFILLMENT_PENDING' }, 503);
            } else if (String(body.type).startsWith('refund.')) {
                const reference = escape(body.reference);
                const row = await checkout.repo.findFirst('commerce_refunds', `(id="${reference}" || data.gatewayReference="${reference}")`);
                if (!row || row.data.gatewayId !== body.targetId) return c.json({ error: 'EVENT_MISMATCH' }, 409);
                await refunds.sync(row.id);
            } else return c.json({ error: 'INVALID_EVENT' }, 400);
            return c.body(null, 204);
        } catch { return c.json({ error: 'RECOVERY_PENDING' }, 503); }
    });
}
module.exports = { registerEvents };
