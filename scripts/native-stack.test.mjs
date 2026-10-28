import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { buildCommand, buildTargets, definition, environment, freePort, matchesIdentity, stageRelays, upgrade, validIdentity } from './native-stack.mjs';

test('Go services compile single-threaded into the binaries their definitions run', () => {
  const config = { PORT: '1437', PAY_PORT: '1440', PAY_GATEWAY_URL: 'http://127.0.0.1:1440', GATEWAY_PORT: '1460', GATEWAY_ADMIN_PORT: '1461' };
  for (const name of ['gateway', 'server', 'pay']) {
    const step = buildCommand(name, config);
    assert.equal(step.executable, 'go');
    assert.deepEqual(step.args, ['build', '-o', definition(name, config).command[0], '.']);
    assert.equal(step.cwd, definition(name, config).cwd);
    assert.equal(step.env.GOMAXPROCS, '1');
    assert.equal(environment(config).GOFLAGS, '-p=1');
  }
  assert.equal(buildCommand('server', { GO_BIN: '/opt/go/bin/go' }).executable, '/opt/go/bin/go');
});

test('up compiles only what it starts; restart and init recompile every selected Go service', () => {
  const all = ['gateway', 'server', 'pay', 'stages', 'miniapp'];
  const running = (name) => name === 'server';
  assert.deepEqual(buildTargets('up', all, running), ['gateway', 'pay']);
  assert.deepEqual(buildTargets('up', ['server'], running), []);
  assert.deepEqual(buildTargets('restart', all, running), ['gateway', 'server', 'pay']);
  assert.deepEqual(buildTargets('restart', ['stages'], running), []);
  assert.deepEqual(buildTargets('init', ['gateway', 'server', 'pay']), ['gateway', 'server', 'pay']);
});

test('older configs are upgraded: stale PocketBase addresses follow the ports, dead ports go, secrets stay', () => {
  const old = { PORT: '1437', PAY_PORT: '1440', PAY_GATEWAY_URL: 'http://127.0.0.1:1440', PB_PORT: '18190', PAY_PB_PORT: '18192',
    ADMIN_PORT: '18180', PB_URL: 'http://127.0.0.1:18190', PAY_PB_URL: 'http://127.0.0.1:18192', JWT_SECRET: 'kept' };
  const next = upgrade(old);
  assert.equal(next.PB_URL, 'http://127.0.0.1:1437');
  assert.equal(next.PAY_PB_URL, 'http://127.0.0.1:1440');
  for (const key of ['PB_PORT', 'PAY_PB_PORT', 'ADMIN_PORT']) assert.equal(key in next, false, key);
  assert.equal(next.JWT_SECRET, 'kept');
  assert.match(next.GATEWAY_ENCRYPTION_KEY, /^[a-f0-9]{32}$/);
  assert.equal(old.PB_URL, 'http://127.0.0.1:18190', 'the input is left alone');
  // An up-to-date config is a fixed point, so startup does not rewrite the file.
  assert.equal(JSON.stringify(upgrade(next)), JSON.stringify(next));
});

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
  const config = { PORT: '1437', PAY_PORT: '1440', PAY_GATEWAY_URL: 'http://127.0.0.1:1440', GATEWAY_PORT: '1460', GATEWAY_ADMIN_PORT: '1461' };
  for (const name of ['gateway', 'server', 'pay', 'stages', 'miniapp']) {
    const service = definition(name, config);
    assert.doesNotMatch(service.command.join(' '), /docker|migrate|seed|superuser|upsert/);
  }
  for (const name of ['hono', 'admin', 'pay-pocketbase']) assert.throws(() => definition(name, config), /Unknown service/);
  // The binaries serve their existing data; migrations and fixtures only run in init.
  // They run as compiled binaries: no `go run` toolchain process stays resident.
  assert.match(definition('server', config).command.join(' '), /^\S+\/\.local\/native\/bin\/server serve --http=127\.0\.0\.1:1437 --dir=\S+business-data$/);
  assert.match(definition('pay', config).command.join(' '), /^\S+\/\.local\/native\/bin\/pay serve --http=127\.0\.0\.1:1440 --dir=\S+payment-data$/);
  assert.equal(definition('pay', config).url, 'http://127.0.0.1:1440/ready');
  // The API gateway keeps its admin plane on loopback and seals secrets with a local key.
  assert.match(definition('gateway', config).command.join(' '),
    /^\S+\/\.local\/native\/bin\/gateway serve --http=127\.0\.0\.1:1461 --dir=\S+gateway-data --encryptionEnv=GATEWAY_ENCRYPTION_KEY$/);
  assert.deepEqual(definition('gateway', config).env, { GATEWAY_LISTEN: '127.0.0.1:1460' });
  // Each registered service announces its own address.
  assert.equal(definition('server', config).env.GATEWAY_INSTANCE_ADDRESS, '127.0.0.1:1437');
  assert.equal(definition('pay', config).env.GATEWAY_INSTANCE_ADDRESS, '127.0.0.1:1440');
  // TEST and PRE get a relay port per service, each forwarding to the one running listener.
  const pools = stageRelays.map(({ stage, service, target }) => `${service}@${stage}->${config[target]}`);
  assert.deepEqual(pools.sort(), ['kanyue.pay@PRE->1440', 'kanyue.pay@TEST->1440', 'kanyue.server@PRE->1437', 'kanyue.server@TEST->1437']);
  assert.equal(new Set(stageRelays.map((entry) => entry.port)).size, stageRelays.length);
  assert.deepEqual(definition('stages', config).ports, stageRelays.map((entry) => entry.port));
  assert.match(definition('stages', config).url, /^http:\/\/127\.0\.0\.1:\d+\/api\/health$/);
  const env = environment(config);
  assert.equal(env.GATEWAY_URL, 'http://127.0.0.1:1461');
  assert.equal(env.PB_URL, 'http://127.0.0.1:1437');
  assert.equal(env.PAY_PB_URL, 'http://127.0.0.1:1440');
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.GOFLAGS, '-p=1');
  assert.equal(env.HONO_UPSTREAM_URL, undefined);
});
