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
test('native definitions do not run Docker or initialization during startup', () => {
  const config = { PORT: '1437', PAY_PORT: '1440', PAY_GATEWAY_URL: 'http://127.0.0.1:1440' };
  for (const name of ['server', 'gateway', 'miniapp']) {
    const service = definition(name, config);
    assert.doesNotMatch(service.command.join(' '), /docker|migrate|seed|superuser|upsert/);
  }
  for (const name of ['hono', 'admin', 'pay-pocketbase']) assert.throws(() => definition(name, config), /Unknown service/);
  // Both binaries serve their existing data; migrations and fixtures only run in init.
  assert.match(definition('server', config).command.join(' '), /^go run \. serve --http=127\.0\.0\.1:1437 --dir=\S+business-data$/);
  assert.match(definition('gateway', config).command.join(' '), /^go run \. serve --http=127\.0\.0\.1:1440 --dir=\S+payment-data$/);
  assert.equal(definition('gateway', config).url, 'http://127.0.0.1:1440/ready');
  const env = environment(config);
  assert.equal(env.PB_URL, 'http://127.0.0.1:1437');
  assert.equal(env.PAY_PB_URL, 'http://127.0.0.1:1440');
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.GOFLAGS, '-p=1');
  assert.equal(env.HONO_UPSTREAM_URL, undefined);
});
