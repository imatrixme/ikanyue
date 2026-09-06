const { opsAuthMiddleware, opsPasswordChangeGuard } = require('../../middleware/opsAuth');
const { requireCourseCreditCapability, COURSE_CREDIT_CAPABILITIES } = require('../../services/courseCredits/authorization');
const { safeQuery, readJsonBody } = require('../courseCredits/handlers');
const { CommerceOperations, validateReason } = require('../../services/commerce/operations');
const { CommerceOffers } = require('../../services/commerce/offers');
const { CommerceCases } = require('../../services/commerce/cases');

function registerOperations(routes, load) {
    const handler = (action) => (c) => safeQuery(c, async () => {
        const user = c.get('user'); requireCourseCreditCapability(user, COURSE_CREDIT_CAPABILITIES.FINANCE);
        const { checkout, refunds } = await load();
        return action(c, new CommerceOperations(checkout, refunds), user);
    });
    const get = (path, action) => routes.get(`/ops/commerce${path}`).use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handler(action));
    const post = (path, action) => routes.post(`/ops/commerce${path}`).use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handler(action));
    get('/orders', (c, service) => service.orders(c.req.query()));
    get('/orders/:id', (c, service) => service.detail(c.req.param('id')));
    post('/orders/:id/refunds', async (c, service, user) => service.refund(c.req.param('id'), await readJsonBody(c), user));
    post('/orders/:id/recover', async (c, service, user) => service.recoverOrder(c.req.param('id'), await readJsonBody(c), user));
    post('/refunds/:id/retry', async (c, service, user) => service.refunds.retryLiability(c.req.param('id'),
        { id: user.id, reason: validateReason((await readJsonBody(c)).reason) }));
    get('/offers', (c, service) => new CommerceOffers(service.checkout).list());
    post('/offers', async (c, service, user) => new CommerceOffers(service.checkout).save(await readJsonBody(c), user));
    post('/offers/:id/status', async (c, service, user) => new CommerceOffers(service.checkout).transition(c.req.param('id'), await readJsonBody(c), user));
    get('/cases', (c, service) => new CommerceCases(service).list());
    post('/cases/:id', async (c, service, user) => new CommerceCases(service).update(c.req.param('id'), await readJsonBody(c), user));
    get('/statements', (c, service) => service.checkout.gateway.request('/v1/statements'));
    get('/statements/:id', (c, service) => service.checkout.gateway.request(`/v1/statements/${encodeURIComponent(c.req.param('id'))}`));
    get('/statements/:id/export', (c, service) => service.checkout.gateway.request(`/v1/statements/${encodeURIComponent(c.req.param('id'))}/export`));
    post('/statements/download', async (c, service, user) => service.checkout.gateway.request('/v1/statements/download', 'POST',
        { date: (await readJsonBody(c)).date, actorId: user.id }));
    post('/statements/import', async (c, service, user) => {
        const body = await readJsonBody(c);
        return service.checkout.gateway.request('/v1/statements/import', 'POST', { date: body.date, content: body.content, actorId: user.id });
    });
    post('/statements/:id/settlement', async (c, service, user) => {
        const body = await readJsonBody(c);
        return service.checkout.gateway.request(`/v1/statements/${encodeURIComponent(c.req.param('id'))}/settlement`, 'POST',
            { reference: body.reference, amount: body.amount, evidenceHash: body.evidenceHash, date: body.date, actorId: user.id });
    });
    post('/statement-lines/:id/resolve', async (c, service, user) => service.checkout.gateway.request(
        `/v1/statement-lines/${encodeURIComponent(c.req.param('id'))}/resolve`, 'POST', { actorId: user.id, note: validateReason((await readJsonBody(c)).note) }));
    get('/recovery-work', (c, service) => service.checkout.gateway.request('/v1/work'));
    post('/recovery-work/:id/retry', async (c, service, user) => service.checkout.gateway.request(
        `/v1/work/${encodeURIComponent(c.req.param('id'))}/retry`, 'POST', { actorId: user.id, reason: validateReason((await readJsonBody(c)).reason) }));
}
module.exports = { registerOperations };
