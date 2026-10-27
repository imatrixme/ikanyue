import type { Hono } from 'hono';
import { ensure } from './domain';
import { Statements, type Statement } from './statements';
import type { WechatGateway } from './wechat/gateway';

export function registerStatements(app: Hono, gateway: WechatGateway) {
  const service = new Statements(gateway, gateway.adapter.client.credentials);
  app.get('/v1/statements', async (c) => c.json({ items: (await gateway.store.list<Statement>('statement', gateway.owner))
    .map(({ id, data }) => ({ id, ...data })).sort((a, b) => b.date.localeCompare(a.date)) }));
  app.get('/v1/statements/:id', async (c) => c.json(await service.detail(c.req.param('id'))));
  app.post('/v1/statements/download', async (c) => {
    const body = await c.req.json();
    ensure(typeof body.actorId === 'string' && body.actorId.length > 0, 'ACTOR_REQUIRED');
    if (!gateway.adapter.client.mock) ensure(String(body.date) < new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), 'STATEMENT_NOT_GENERATED');
    const bill = await gateway.adapter.client.bill(String(body.date));
    return c.json(await service.import({ ...bill, source: 'channel', actorId: body.actorId }));
  });
  app.post('/v1/statements/import', async (c) => {
    const body = await c.req.json();
    ensure(typeof body.content === 'string' && typeof body.date === 'string' && typeof body.actorId === 'string' && body.actorId.length > 0, 'INVALID_STATEMENT');
    return c.json(await service.import({ date: body.date, content: body.content,
      actorId: body.actorId, source: 'manual', mock: gateway.adapter.client.mock }));
  });
  app.post('/v1/statement-lines/:id/resolve', async (c) => {
    const body = await c.req.json(); await service.review(c.req.param('id'), String(body.actorId || ''), String(body.note || ''));
    return c.json({ resolved: true });
  });
  app.post('/v1/statements/:id/settlement', async (c) => c.json(await service.settlement(c.req.param('id'), await c.req.json())));
  app.get('/v1/statements/:id/export', async (c) => c.json({ content: await service.export(c.req.param('id')) }));
}
