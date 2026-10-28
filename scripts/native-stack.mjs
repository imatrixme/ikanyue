#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '..');
const state = join(root, '.local/native');
const configPath = join(state, 'environment.json');
// gateway (kanyue.gateway) starts first so server and pay register on their first heartbeat.
const names = ['gateway', 'server', 'pay', 'miniapp'];
const server = join(root, 'kanyue.server');
const pay = join(root, 'kanyue.pay');
const gateway = join(root, 'kanyue.gateway');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const fail = (message) => { throw new Error(message); };
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pidFile = (name) => join(state, 'run', `${name}.json`);
const logFile = (name) => join(state, 'logs', `${name}.log`);
const businessData = () => `--dir=${join(state, 'business-data')}`;
const paymentData = () => `--dir=${join(state, 'payment-data')}`;
const gatewayData = () => `--dir=${join(state, 'gateway-data')}`;
// Generated once per machine and persisted; older configs predate the gateway.
const gatewayDefaults = () => ({
  GATEWAY_PORT: '1460', GATEWAY_ADMIN_PORT: '1461',
  GATEWAY_REGISTRATION_TOKEN: randomBytes(32).toString('hex'),
  GATEWAY_ENCRYPTION_KEY: randomBytes(16).toString('hex'),
  GATEWAY_PB_PASSWORD: randomBytes(24).toString('hex'),
});

function settings() {
  if (!existsSync(configPath)) fail('Run test init first; normal startup never initializes data.');
  const config = read(configPath);
  // Older local configs predate JWT_SECRET; persist one so sessions survive restarts.
  const missing = Object.entries({ JWT_SECRET: randomBytes(32).toString('hex'), ...gatewayDefaults() })
    .filter(([key]) => !config[key]);
  if (missing.length) {
    Object.assign(config, Object.fromEntries(missing));
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  return config;
}
const goBin = (config) => config.GO_BIN || 'go';
function environment(config) {
  // Both binaries embed PocketBase: PB_URL and PAY_PB_URL are their own addresses (maintenance backups use them).
  // Go builds stay single-package so a restart never saturates the machine.
  // Server and pay register with the local API gateway; each sets its own GATEWAY_INSTANCE_ADDRESS.
  return { ...process.env, ...config, NODE_ENV: 'development', GOFLAGS: '-p=1',
    PB_URL: `http://127.0.0.1:${config.PORT}`, PAY_PB_URL: config.PAY_GATEWAY_URL,
    GATEWAY_URL: `http://127.0.0.1:${config.GATEWAY_ADMIN_PORT}` };
}
function definition(name, config) {
  const definitions = {
    gateway: { cwd: gateway,
      command: [goBin(config), 'run', '.', 'serve', `--http=127.0.0.1:${config.GATEWAY_ADMIN_PORT}`, gatewayData(), '--encryptionEnv=GATEWAY_ENCRYPTION_KEY'],
      env: { GATEWAY_LISTEN: `127.0.0.1:${config.GATEWAY_PORT}` },
      port: Number(config.GATEWAY_ADMIN_PORT), url: `http://127.0.0.1:${config.GATEWAY_ADMIN_PORT}/api/health` },
    server: { cwd: server, command: [goBin(config), 'run', '.', 'serve', `--http=127.0.0.1:${config.PORT}`, businessData()],
      env: { GATEWAY_INSTANCE_ADDRESS: `127.0.0.1:${config.PORT}` },
      port: Number(config.PORT), url: `http://127.0.0.1:${config.PORT}/api/health` },
    pay: { cwd: pay, command: [goBin(config), 'run', '.', 'serve', `--http=127.0.0.1:${config.PAY_PORT}`, paymentData()],
      env: { GATEWAY_INSTANCE_ADDRESS: `127.0.0.1:${config.PAY_PORT}` },
      port: Number(config.PAY_PORT), url: `${config.PAY_GATEWAY_URL}/ready` },
    miniapp: { cwd: join(root, 'ikanyue.taro3'), command: [process.execPath, 'node_modules/@tarojs/cli/bin/taro', 'build', '--type', 'weapp', '--watch'] },
  };
  if (!definitions[name]) fail(`Unknown service: ${name}`);
  return definitions[name];
}
function owned(name) {
  if (!existsSync(pidFile(name))) return null;
  const entry = read(pidFile(name));
  if (!validIdentity(entry)) return null;
  const result = spawnSync('ps', ['-p', String(entry.pid), '-o', 'args='], { encoding: 'utf8' });
  return matchesIdentity(entry, name, result) ? entry : null;
}
function validIdentity(entry) {
  return Number.isSafeInteger(entry.pid) && entry.pid >= 2 && /^[a-f0-9]{32}$/.test(entry.token);
}
function matchesIdentity(entry, name, result) {
  return validIdentity(entry) && names.includes(name) && result.status === 0
    && result.stdout.trim().endsWith(`${script} supervise ${name} ${entry.token}`);
}
async function freePort(port) {
  if (!port) return;
  await new Promise((done, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Port ${port} is occupied. No process was stopped.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(done));
  });
}
async function waitReady(name, config) {
  const target = definition(name, config);
  for (let attempt = 0; attempt < 120; attempt++) {
    if (!owned(name)) fail(`${name} exited; inspect ${logFile(name)}`);
    if (!target.url) return;
    try {
      const result = await fetch(target.url, { signal: AbortSignal.timeout(1000) });
      if (result.ok) return;
    } catch { /* Service may still be starting. */ }
    await pause(250);
  }
  fail(`${name} is not ready; inspect ${logFile(name)}`);
}
async function start(name, config) {
  if (owned(name)) { await waitReady(name, config); return; }
  await freePort(definition(name, config).port);
  mkdirSync(join(state, 'run'), { recursive: true }); mkdirSync(join(state, 'logs'), { recursive: true });
  const token = randomBytes(16).toString('hex');
  const log = openSync(logFile(name), 'a', 0o600);
  const child = spawn(process.execPath, [script, 'supervise', name, token], {
    cwd: root, detached: true, stdio: ['ignore', log, log], env: environment(config),
  });
  closeSync(log);
  writeFileSync(pidFile(name), JSON.stringify({ pid: child.pid, token }), { mode: 0o600 });
  child.unref();
  await pause(100); await waitReady(name, config);
  console.log(`${name}: ${definition(name, config).url ? 'ready' : 'process started'}`);
}
async function stop(name) {
  const entry = owned(name);
  if (!entry) { console.log(`${name}: not owned/running; nothing stopped`); return; }
  process.kill(-entry.pid, 'SIGTERM');
  for (let attempt = 0; attempt < 80 && owned(name); attempt++) await pause(100);
  if (owned(name)) fail(`${name} did not stop gracefully; no forced termination performed.`);
  unlinkSync(pidFile(name));
}
async function supervise(name, token) {
  if (!/^[a-f0-9]{32}$/.test(token || '')) fail('Invalid process identity');
  const config = settings(); const target = definition(name, config);
  const child = spawn(target.command[0], target.command.slice(1), { cwd: target.cwd, env: { ...environment(config), ...target.env }, stdio: 'inherit' });
  child.on('error', () => process.exit(1));
  child.on('exit', (code) => process.exit(code || 0));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); });
}
async function command(executable, args, cwd, config, label) {
  const log = openSync(logFile('bootstrap'), 'a', 0o600);
  const child = spawn(executable, args, { cwd, env: environment(config), stdio: ['ignore', log, log] });
  const code = await new Promise((done) => { child.on('exit', done); child.on('error', () => done(1)); });
  closeSync(log);
  if (code !== 0) fail(`${label} failed; inspect ${logFile('bootstrap')}`);
  console.log(`${label}: complete`);
}
async function initialize() {
  mkdirSync(state, { recursive: true }); mkdirSync(join(state, 'logs'), { recursive: true });
  if (!existsSync(configPath)) {
    const config = {
      PORT: '1437', PAY_PORT: '1440',
      PAY_GATEWAY_URL: 'http://127.0.0.1:1440', KANYUE_LOCAL_API_URL: 'http://127.0.0.1:1437',
      PB_EMAIL: 'admin@local.com', PAY_PB_EMAIL: 'admin@local.com',
      PB_PASSWORD: 'admin870329', PAY_PB_PASSWORD: randomBytes(24).toString('hex'),
      JWT_SECRET: randomBytes(32).toString('hex'),
      PAY_SERVICE_TOKEN: randomBytes(32).toString('hex'), PAY_MOCK_TOKEN: randomBytes(32).toString('hex'),
      PAY_PROVIDER: 'wechatpay-mock', PAY_CLIENT_ID: 'kanyue', PAY_MOCK_ENABLED: 'true', COURSE_COMMERCE_ENABLED: 'true',
      COURSE_CREDIT_GRANTS_ENABLED: 'true', COURSE_CREDIT_RESERVATION_ENABLED: 'true',
      COURSE_CREDIT_SETTLEMENT_ENABLED: 'true', COURSE_CREDIT_MIGRATION_ENABLED: 'false',
      OPS_BOOTSTRAP_ADMIN_EMAIL: 'admin@local.com', OPS_BOOTSTRAP_ADMIN_CELLPHONE: '13900000000',
      KANYUE_LOCAL_SEED: 'true', LOCAL_STUDENT_PASSWORD: 'admin870329', LOCAL_TEACHER_PASSWORD: 'admin870329',
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  const config = settings();
  // serve refuses to start while a migration is pending, so they always run here first.
  if (!existsSync(join(state, 'business-data', 'data.db'))) {
    await command(goBin(config), ['run', '.', 'superuser', 'upsert', config.PB_EMAIL, config.PB_PASSWORD, businessData()], server, config, 'Server dashboard account');
  }
  await command(goBin(config), ['run', '.', 'migrate', 'up', businessData()], server, config, 'Server migrations');
  await command(goBin(config), ['run', '.', 'seed', 'local', businessData()], server, config, 'Local fixtures');
  if (!existsSync(join(state, 'payment-data', 'data.db'))) {
    await command(goBin(config), ['run', '.', 'superuser', 'upsert', config.PAY_PB_EMAIL, config.PAY_PB_PASSWORD, paymentData()], pay, config, 'Pay dashboard account');
  }
  await command(goBin(config), ['run', '.', 'migrate', 'up', paymentData()], pay, config, 'Pay migrations');
  // The gateway has no migrate command: serve runs its migrations, then converts legacy sites and routes once.
  if (!config.GATEWAY_PB_EMAIL) {
    // The console needs password + authenticator: enroll with `GATEWAY_ENCRYPTION_KEY=... go run . totp enroll <email> --dir=... --encryptionEnv=GATEWAY_ENCRYPTION_KEY` in kanyue.gateway.
    config.GATEWAY_PB_EMAIL = config.PB_EMAIL;
    await command(goBin(config), ['run', '.', 'superuser', 'upsert', config.GATEWAY_PB_EMAIL, config.GATEWAY_PB_PASSWORD, gatewayData()], gateway, config, 'Gateway console account');
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  console.log('Native data initialized. Docker volumes untouched. Use test up to start applications.');
}
async function main() {
  const [action = 'status', selected, token] = process.argv.slice(2);
  if (action === '--help' || action === '-h' || action === 'help') {
    console.log(`Usage: test {init|up|down|restart|status|logs|smoke} [service]\nServices: ${names.join(', ')}\nInitialization is explicit; regular startup never seeds data or builds Docker images.`);
    return;
  }
  if (action === 'supervise') return supervise(selected, token);
  if (action === 'init' || action === 'bootstrap') return initialize();
  if (action === 'status') {
    for (const name of names) console.log(`${name}: ${owned(name) ? 'running' : 'stopped'}`);
    return;
  }
  if (action === 'logs') {
    const name = selected || 'server'; if (!names.includes(name) && name !== 'bootstrap') fail('Unknown log');
    console.log(existsSync(logFile(name)) ? readFileSync(logFile(name), 'utf8').split('\n').slice(-60).join('\n') : 'No logs');
    return;
  }
  const targets = selected && selected !== '--no-build' ? [selected] : names;
  if (targets.some((name) => !names.includes(name))) fail('Unknown service');
  if (action === 'down' || action === 'restart') for (const name of [...targets].reverse()) await stop(name);
  if (action === 'up' || action === 'restart') {
    const config = settings();
    if (!existsSync(join(state, 'payment-data/data.db')) || !existsSync(join(state, 'gateway-data/data.db'))) fail('Run test init before startup');
    for (const name of targets) await start(name, config);
    // Consoles are embedded at build time: npm run build:server in ikanyue.admin, npm run build in kanyue.gateway/console.
    console.log(`Admin and API: http://127.0.0.1:${config.PORT}/; pay: ${config.PAY_GATEWAY_URL}; `
      + `API gateway: http://127.0.0.1:${config.GATEWAY_PORT} (console http://127.0.0.1:${config.GATEWAY_ADMIN_PORT}/console/)`);
    return;
  }
  if (action === 'smoke') {
    const config = settings();
    for (const name of names) await waitReady(name, config);
    console.log('Native processes and HTTP readiness passed; business journey requires commerce smoke.');
    return;
  }
  if (action !== 'down') fail('Usage: test {init|up|down|restart|status|logs|smoke} [service]');
}
if (process.argv[1] && resolve(process.argv[1]) === script) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
export { definition, environment, freePort, matchesIdentity, validIdentity };
