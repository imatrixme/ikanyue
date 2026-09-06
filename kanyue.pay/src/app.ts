import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { equalSecret, GatewayError, ensure, recordId } from './domain';
import { Gateway } from './gateway';
import { financialSummary, reconcile } from './finance';
import type { config } from './config';
import type { Payment, Refund, Row } from './types';
import { WechatGateway } from './wechat/gateway';
import { DurableWork } from './work';
import { registerStatements } from './statementRoutes';

export function createApp(gateway: Gateway, settings: ReturnType<typeof config>) {
  const app = new Hono();
  app.use('*', async (c, next) => bodyLimit({ maxSize: c.req.path === '/v1/statements/import' ? 2 * 1024 * 1024 : 16384 })(c, next));
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: 'REQUEST_REJECTED' }, error.status);
    if (error instanceof GatewayError) return c.json({ error: error.code }, error.status as 400);
    if (error instanceof SyntaxError) return c.json({ error: 'INVALID_JSON' }, 400);
    return c.json({ error: 'GATEWAY_UNAVAILABLE' }, 503);
  });
  app.get('/health', (c) => c.json({ service: 'kanyue.pay', provider: settings.provider, status: 'ok' }));
  app.get('/ready', async (c) => {
    await gateway.store.list('payment', gateway.owner);
    return c.json({ status: 'ready' });
  });
  app.use('/v1/*', async (c, next) => {
    ensure(equalSecret(c.req.header('Authorization') || '', `Bearer ${settings.token}`), 'UNAUTHORIZED', 401);
    await next();
  });
  app.post('/v1/payments', async (c) => c.json(present(await gateway.createPayment(
    await body(c.req.raw), c.req.header('Idempotency-Key') || ''
  ), gateway), 201));
  app.get('/v1/payments/:id', async (c) => c.json(present(await gateway.owned<Payment>(c.req.param('id'), 'payment'), gateway)));
  app.post('/v1/payments/:id/close', async (c) => c.json(present(await gateway.closePayment(c.req.param('id')), gateway)));
  app.post('/v1/refunds', async (c) => c.json(present(await gateway.createRefund(
    await body(c.req.raw), c.req.header('Idempotency-Key') || ''
  )), 201));
  app.get('/v1/refunds/:id', async (c) => c.json(present(await gateway.owned<Refund>(c.req.param('id'), 'refund'))));
  app.get('/v1/events', async (c) => c.json({ items: await gateway.events() }));
  app.post('/v1/events/:id/ack', async (c) => { await gateway.acknowledge(c.req.param('id')); return c.json({ acknowledged: true }); });
  app.get('/v1/finance', async (c) => c.json({ ...await financialSummary(gateway.store, gateway.owner), provider: settings.live ? 'wechatpay' : 'mock' }));
  app.get('/v1/work', async (c) => c.json({ items: await gateway.store.list('work', gateway.owner) }));
  app.post('/v1/work/:id/retry', async (c) => {
    const input = await body(c.req.raw);
    await new DurableWork(gateway.store, gateway.owner).reset(c.req.param('id'), String(input.actorId || ''), String(input.reason || ''));
    return c.json({ resumed: true });
  });
  app.post('/v1/reconciliation', async (c) => c.json(await reconcile(gateway.store, gateway.owner)));
  if (gateway instanceof WechatGateway) {
    registerStatements(app, gateway);
    app.post('/v1/payments/:id/refresh', async (c) => {
      await gateway.recoverTarget(c.req.param('id'), 'payment');
      return c.json(present(await gateway.owned<Payment>(c.req.param('id'), 'payment'), gateway));
    });
    app.post('/callbacks/wechatpay', async (c) => {
      await gateway.notification(c.req.raw.headers, await c.req.text()); return c.body(null, 204);
    });
    app.get('/v1/providers/wechatpay/bills/:date', async (c) => c.json(await gateway.adapter.client.bill(c.req.param('date'))));
  }
  if (['mock', 'wechatpay-mock'].includes(settings.provider) && ['development', 'test'].includes(settings.mode)) {
    app.use('/_test/*', async (c, next) => {
      ensure(equalSecret(c.req.header('Authorization') || '', `Bearer ${settings.mockToken}`), 'UNAUTHORIZED', 401);
      await next();
    });
    app.post('/_test/observations/:id', async (c) => c.json(await gateway.observe(c.req.param('id'), await body(c.req.raw))));
    app.post('/_test/poll', async (c) => {
      // Explicit test controls advance the peer immediately, without changing production backoff.
      const subject = gateway instanceof WechatGateway ? new WechatGateway(gateway.store, gateway.owner, gateway.mock.keys) : gateway;
      return c.json(await subject.poll());
    });
    if (gateway instanceof WechatGateway) app.post('/_test/wechatpay/notify/:id', async (c) => {
      await gateway.owned(recordId('provider', c.req.param('id')), 'provider');
      const notification = await gateway.mock.notification(c.req.param('id'));
      await gateway.notification(notification.headers, await notification.text());
      return c.json({ delivered: true });
    });
  }
  return app;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json();
  ensure(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_BODY');
  return value;
}
function present(row: Row<Payment | Refund>, gateway?: Gateway) {
  const { fingerprint: _, payerId: _payer, prepayId: _prepay, ...data } = row.data as Payment & Partial<Refund>;
  return { id: row.id, ...data, ...(row.kind === 'payment' && row.data.status === 'pending'
    ? { action: gateway instanceof WechatGateway ? gateway.action(row as Row<Payment>) : { type: 'mock', paymentId: row.id } } : {}) };
}
