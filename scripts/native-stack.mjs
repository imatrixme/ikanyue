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
const names = ['pocketbase', 'pay-pocketbase', 'gateway', 'hono', 'commerce-worker', 'admin', 'miniapp'];
const backend = join(root, 'ikanyue.mapi.hono');
const pay = join(root, 'kanyue.pay');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const fail = (message) => { throw new Error(message); };
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pidFile = (name) => join(state, 'run', `${name}.json`);
const logFile = (name) => join(state, 'logs', `${name}.log`);

function settings() {
  if (!existsSync(configPath)) fail('Run test init first; normal startup never initializes data.');
  return read(configPath);
}
function environment(config) {
  return { ...process.env, ...config, NODE_ENV: 'development', KANYUE_ENV_FILE: '/dev/null',
    HOST: '127.0.0.1', PAY_HOST: '127.0.0.1',
    VITE_OPS_API_BASE: '/ops', KANYUE_LOCAL_API_ORIGIN: `http://127.0.0.1:${config.PORT}`,
    PATH: `${dirname(config.BUN_BIN)}:${process.env.PATH || ''}` };
}
function definition(name, config) {
  const pb = (port, directory) => ({ cwd: root, command: [config.POCKETBASE_BIN, 'serve',
    `--http=127.0.0.1:${port}`, `--dir=${join(state, directory)}`], port: Number(port), url: `http://127.0.0.1:${port}/api/health` });
  const definitions = {
    pocketbase: pb(config.PB_PORT, 'business-data'),
    'pay-pocketbase': pb(config.PAY_PB_PORT, 'payment-data'),
    gateway: { cwd: pay, command: [config.BUN_BIN, '--watch', 'src/index.ts'], port: Number(config.PAY_PORT), url: `${config.PAY_GATEWAY_URL}/ready` },
    hono: { cwd: backend, command: [process.execPath, '--watch', 'src/app.js'], port: Number(config.PORT), url: `http://127.0.0.1:${config.PORT}/` },
    'commerce-worker': { cwd: backend, command: [process.execPath, '--watch', 'scripts/commerce-worker.js'] },
    admin: { cwd: join(root, 'ikanyue.admin'), command: [process.execPath, 'node_modules/vite/bin/vite.js',
      '--host', '127.0.0.1', '--port', config.ADMIN_PORT, '--strictPort'], port: Number(config.ADMIN_PORT), url: `http://127.0.0.1:${config.ADMIN_PORT}/` },
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
  const child = spawn(target.command[0], target.command.slice(1), { cwd: target.cwd, env: environment(config), stdio: 'inherit' });
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
      POCKETBASE_BIN: join(root, '.local/bin/pocketbase'),
      BUN_BIN: join(root, '.local/toolchains/bun-1.4.1/node_modules/.bin/bun'),
      PB_PORT: '18190', PAY_PB_PORT: '18192', PORT: '1437', PAY_PORT: '1440', ADMIN_PORT: '18180',
      PB_URL: 'http://127.0.0.1:18190', PAY_PB_URL: 'http://127.0.0.1:18192',
      PAY_GATEWAY_URL: 'http://127.0.0.1:1440', KANYUE_LOCAL_API_URL: 'http://127.0.0.1:1437',
      VITE_OPS_API_BASE: '/ops', VITE_OPS_API_MOCK: 'false',
      PB_EMAIL: 'admin@local.com', PAY_PB_EMAIL: 'admin@local.com',
      PB_PASSWORD: 'admin870329', PAY_PB_PASSWORD: randomBytes(24).toString('hex'),
      PAY_SERVICE_TOKEN: randomBytes(32).toString('hex'), PAY_MOCK_TOKEN: randomBytes(32).toString('hex'),
      PAY_PROVIDER: 'wechatpay-mock', PAY_CLIENT_ID: 'kanyue', PAY_MOCK_ENABLED: 'true', COURSE_COMMERCE_ENABLED: 'true',
      COURSE_CREDIT_GRANTS_ENABLED: 'true', COURSE_CREDIT_RESERVATION_ENABLED: 'true',
      COURSE_CREDIT_SETTLEMENT_ENABLED: 'true', COURSE_CREDIT_EXPLICIT_CONVERSION_ENABLED: 'false',
      COURSE_CREDIT_IMPLICIT_CONVERSION_ENABLED: 'false', COURSE_CREDIT_MIGRATION_ENABLED: 'false',
      OPS_BOOTSTRAP_CORE_COLLECTIONS: 'true', OPS_BOOTSTRAP_ADMIN_ENABLED: 'true',
      OPS_BOOTSTRAP_ADMIN_USERNAME: 'admin', OPS_BOOTSTRAP_ADMIN_EMAIL: 'admin@local.com',
      OPS_BOOTSTRAP_ADMIN_PASSWORD: 'admin870329!!', OPS_BOOTSTRAP_ADMIN_CELLPHONE: '13900000000',
      OPS_BOOTSTRAP_ADMIN_NAME: '本地管理员', OPS_BOOTSTRAP_ADMIN_FORCE_PASSWORD_CHANGE: 'false',
      KANYUE_LOCAL_SEED: 'true', LOCAL_STUDENT_PASSWORD: 'admin870329', LOCAL_TEACHER_PASSWORD: 'admin870329',
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  const config = settings();
  for (const binary of [config.POCKETBASE_BIN, config.BUN_BIN]) if (!existsSync(binary)) fail(`Missing runtime: ${binary}`);
  for (const [name, directory, email, password] of [
    ['pocketbase', 'business-data', config.PB_EMAIL, config.PB_PASSWORD],
    ['pay-pocketbase', 'payment-data', config.PAY_PB_EMAIL, config.PAY_PB_PASSWORD],
  ]) {
    if (!existsSync(join(state, directory, 'data.db'))) {
      await command(config.POCKETBASE_BIN, ['superuser', 'upsert', email, password, `--dir=${join(state, directory)}`], root, config, `${name} initial account`);
    }
    await start(name, config);
  }
  await command(process.execPath, ['scripts/pb-ensure-ops-schema.js'], backend, config, 'Ops schema');
  await command(process.execPath, ['scripts/pb-ensure-course-credit-schema.js'], backend, config, 'Course schema');
  await command(process.execPath, ['scripts/pb-ensure-commerce-schema.js'], backend, config, 'Commerce schema');
  await command(config.BUN_BIN, ['scripts/schema.ts'], pay, config, 'Gateway schema');
  await command(process.execPath, ['scripts/pb-seed-points-lite-local.js'], backend, config, 'Local students');
  await command(process.execPath, ['scripts/pb-seed-course-booking-local.js'], backend, config, 'Local bookings');
  await command(process.execPath, ['scripts/pb-seed-commerce-local.js'], backend, config, 'Local commerce offers');
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
    const name = selected || 'hono'; if (!names.includes(name) && name !== 'bootstrap') fail('Unknown log');
    console.log(existsSync(logFile(name)) ? readFileSync(logFile(name), 'utf8').split('\n').slice(-60).join('\n') : 'No logs');
    return;
  }
  const targets = selected && selected !== '--no-build' ? [selected] : names;
  if (targets.some((name) => !names.includes(name))) fail('Unknown service');
  if (action === 'down' || action === 'restart') for (const name of [...targets].reverse()) await stop(name);
  if (action === 'up' || action === 'restart') {
    const config = settings();
    if (!existsSync(join(state, 'payment-data/data.db'))) fail('Run test init before startup');
    for (const name of targets) await start(name, config);
    console.log(`Admin: http://127.0.0.1:${config.ADMIN_PORT}; API: http://127.0.0.1:${config.PORT}; gateway: ${config.PAY_GATEWAY_URL}`);
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
