const { authMiddleware } = require('../../middleware/auth');
const { opsAuthMiddleware, opsPasswordChangeGuard } = require('../../middleware/opsAuth');
const { invariant } = require('../../services/courseCredits/domain');
const { requireCourseCreditCapability, COURSE_CREDIT_CAPABILITIES } = require('../../services/courseCredits/authorization');
const { createDefaultCourseCreditServices } = require('../../services/courseCredits');
const { safeQuery, readJsonBody } = require('../courseCredits/handlers');
const { GatewayClient } = require('../../services/commerce/gatewayClient');
const { CheckoutService } = require('../../services/commerce/checkoutService');
const { CommerceRefundService } = require('../../services/commerce/refundService');
const { financeView } = require('../../services/commerce/financeView');

async function loadCommerce() {
    const checkout = new CheckoutService(await createDefaultCourseCreditServices(), new GatewayClient());
    return { checkout, refunds: new CommerceRefundService(checkout) };
}
function registerCommerceRoutes(routes, load = loadCommerce, env = process.env) {
    if (env.COURSE_COMMERCE_ENABLED !== 'true') return;
    require('./operations').registerOperations(routes, load);
    require('./events').registerEvents(routes, load, env);
    const student = (action) => (c) => safeQuery(c, async () => {
        const user = c.get('user');
        invariant(user?.id && user.role === 'student', 'STUDENT_LEARNING_STUDENT_REQUIRED', '仅学员可以购买课程');
        return action(c, user.id, await load());
    });
    const finance = (action) => (c) => safeQuery(c, async () => {
        requireCourseCreditCapability(c.get('user'), COURSE_CREDIT_CAPABILITIES.FINANCE);
        return action(c, await load());
    });
    routes.get('/v1/student/commerce/catalog').use(authMiddleware)
        .handler(student((c, user, { checkout }) => checkout.catalog()));
    routes.get('/v1/student/commerce/orders').use(authMiddleware)
        .handler(student((c, user, { checkout }) => checkout.list(user)));
    routes.post('/v1/student/commerce/orders').use(authMiddleware)
        .handler(student(async (c, user, { checkout }) => checkout.checkout(user, await readJsonBody(c), c.get('user'))));
    routes.post('/v1/student/commerce/orders/:id/cashier').use(authMiddleware)
        .handler(student((c, user, { checkout }) => checkout.cashier(user, c.req.param('id'), c.get('user'))));
    routes.get('/v1/student/commerce/orders/:id').use(authMiddleware)
        .handler(student((c, user, { checkout }) => checkout.detail(user, c.req.param('id'))));
    routes.post('/v1/student/commerce/orders/:id/refresh').use(authMiddleware)
        .handler(student(async (c, user, { checkout }) => {
            await checkout.owned(user, c.req.param('id'));
            await checkout.sync(c.req.param('id'));
            return checkout.detail(user, c.req.param('id'));
        }));
    if (['development', 'test'].includes(env.NODE_ENV) && env.PAY_MOCK_ENABLED === 'true') {
        routes.post('/v1/student/commerce/orders/:id/mock-pay').use(authMiddleware)
            .handler(student((c, user, { checkout }) => checkout.mockPay(user, c.req.param('id'))));
    }
    routes.get('/v1/student/commerce/orders/:id/refund-preview').use(authMiddleware)
        .handler(student(async (c, user, { refunds }) => {
            const { amount, currency, lines, blocked, message } = await refunds.preview(user, c.req.param('id'));
            return { amount, currency, lines, blocked, message };
        }));
    routes.post('/v1/student/commerce/orders/:id/refunds').use(authMiddleware)
        .handler(student(async (c, user, { refunds }) => {
            const body = await readJsonBody(c);
            return refunds.request(user, c.req.param('id'), body.key, body.expectedAmount);
        }));
    routes.get('/v1/student/commerce/refunds/:id').use(authMiddleware)
        .handler(student((c, user, { refunds }) => refunds.detail(user, c.req.param('id'))));
    routes.get('/ops/commerce/finance').use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(finance((c, { checkout }) => financeView(checkout)));
    routes.post('/ops/commerce/reconcile').use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(finance((c, { checkout }) => checkout.gateway.request('/v1/reconciliation', 'POST', {})));
    routes.post('/ops/commerce/recover').use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(finance(async (c, { checkout, refunds }) => ({ orders: await checkout.recover(), refunds: await refunds.recover() })));
    if (['development', 'test'].includes(env.NODE_ENV) && env.PAY_MOCK_ENABLED === 'true') {
        routes.post('/ops/commerce/refunds/:id/mock-success').use(opsAuthMiddleware, opsPasswordChangeGuard)
            .handler(finance(async (c, { checkout, refunds }) => {
                const row = await checkout.repo.get('commerce_refunds', c.req.param('id'));
                invariant(row.status === 'processing' && row.data.gatewayId, 'REFUND_NOT_READY', '该退款当前不能模拟到账');
                await checkout.gateway.mockSuccess(row.data.gatewayId);
                await refunds.sync(row.id);
                return refunds.detail(row.studentId, row.id);
            }));
    }
}

module.exports = { registerCommerceRoutes, loadCommerce };
