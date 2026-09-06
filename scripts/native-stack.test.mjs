import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { definition, environment, freePort, matchesIdentity, validIdentity } from './native-stack.mjs';

test('port conflict preserves the unrelated listener', async () => {
  const listener = createServer();
  await new Promise((done) => listener.listen(0, '127.0.0.1', done));
  const port = listener.address().port;
  try {
    await assert.rejects(freePort(port), /occupied. No process was stopped/);
    assert.equal(listener.listening, true);
  } finally { await new Promise((done) => listener.close(done)); }
  await freePort(port);
});
test('PID reuse and malformed process identities never establish ownership', () => {
  const entry = { pid: 123, token: 'a'.repeat(32) };
  const script = new URL('./native-stack.mjs', import.meta.url).pathname;
  assert.equal(matchesIdentity(entry, 'gateway', { status: 0, stdout: `node ${script} supervise gateway ${entry.token}\n` }), true);
  assert.equal(matchesIdentity(entry, 'gateway', { status: 0, stdout: 'node unrelated-app.js' }), false);
  assert.equal(matchesIdentity(entry, 'gateway', { status: 1, stdout: `node ${script} supervise gateway ${entry.token}` }), false);
  for (const pid of [0, 1, -123, NaN, 2.5]) assert.equal(validIdentity({ ...entry, pid }), false);
  assert.equal(validIdentity({ ...entry, token: 'not-an-ownership-token' }), false);
});
test('native definitions do not run Docker or schema initialization during startup', () => {
  const config = { BUN_BIN: '/runtime/bun-1.4.1/bun', POCKETBASE_BIN: '/runtime/pocketbase',
    PB_PORT: '18190', PAY_PB_PORT: '18192', PORT: '1437', PAY_PORT: '1440', ADMIN_PORT: '18180',
    PAY_GATEWAY_URL: 'http://127.0.0.1:1440' };
  for (const name of ['pocketbase', 'pay-pocketbase', 'gateway', 'hono', 'commerce-worker', 'admin', 'miniapp']) {
    const service = definition(name, config);
    assert.doesNotMatch(service.command.join(' '), /docker|schema|seed|superuser|upsert/);
  }
  const env = environment(config);
  assert.equal(env.VITE_OPS_API_BASE, '/ops');
  assert.equal(env.KANYUE_LOCAL_API_ORIGIN, 'http://127.0.0.1:1437');
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.NODE_ENV, 'development');
  assert.ok(env.PATH.startsWith('/runtime/bun-1.4.1:'));
});
