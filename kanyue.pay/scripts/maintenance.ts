import PocketBase from 'pocketbase';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from '../src/config';
import { ensure } from '../src/domain';
import { liveCredentials } from '../src/wechat/live';

export async function backup(scope: 'payment' | 'business') {
  const prefix = scope === 'payment' ? 'PAY_PB' : 'PB';
  const url = process.env[`${prefix}_URL`] || '';
  const target = new URL(url);
  ensure(target.protocol === 'https:' || (target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname)), 'BACKUP_TLS_REQUIRED');
  const pb = new PocketBase(url);
  await pb.collection('_superusers').authWithPassword(process.env[`${prefix}_EMAIL`] || '', process.env[`${prefix}_PASSWORD`] || '');
  const filename = `kanyue-${scope}-${Date.now()}.zip`;
  await pb.backups.create(filename);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if ((await pb.backups.getFullList()).some((file) => file.key === filename && file.size > 0)) { ready = true; break; }
    await Bun.sleep(500);
  }
  ensure(ready, 'BACKUP_NOT_READY');
  const response = await fetch(pb.backups.getDownloadURL(await pb.files.getToken(), filename), { redirect: 'error', signal: AbortSignal.timeout(60000) });
  ensure(response.ok, 'BACKUP_DOWNLOAD_FAILED');
  const directory = mkdtempSync(join(tmpdir(), `kanyue-${scope}-backup-`)); chmodSync(directory, 0o700);
  const archive = join(directory, filename);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()), { flag: 'wx', mode: 0o600 });
  return verifyBackup(archive, scope, url);
}
export function verifyBackup(archive: string, scope: 'payment' | 'business', sourceUrl: string) {
  ensure(archive.startsWith('/') && statSync(archive).isFile(), 'BACKUP_PATH_REQUIRED');
  const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n');
  ensure(entries.length > 0 && entries.every((path) => !path.startsWith('/') && !path.split('/').includes('..') && !path.includes('\\')), 'BACKUP_UNSAFE_PATH');
  const restored = mkdtempSync(join(tmpdir(), `kanyue-${scope}-restore-check-`)); chmodSync(restored, 0o700);
  execFileSync('unzip', ['-q', archive, '-d', restored]);
  const database = join(restored, 'data.db');
  const integrity = execFileSync('sqlite3', ['-readonly', database, 'PRAGMA integrity_check;'], { encoding: 'utf8' }).trim();
  ensure(integrity === 'ok', 'BACKUP_INTEGRITY_FAILED');
  const tables = scope === 'payment' ? ['pay_entities', 'pay_claims'] : ['commerce_orders', 'commerce_refunds', 'commerce_audit', 'credit_batches', 'credit_events'];
  const counts = Object.fromEntries(tables.map((table) => [table,
    Number(execFileSync('sqlite3', ['-readonly', database, `SELECT count(*) FROM ${table};`], { encoding: 'utf8' }).trim())]));
  const report = { scope, sourceUrl, archive, restored, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
    integrity, counts, verifiedAt: new Date().toISOString(), destructiveRestorePerformed: false };
  const reportPath = `${archive}.verified.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { reportPath, ...report };
}
export function preflight() {
  const settings = config(); ensure(settings.live, 'LIVE_CONFIGURATION_NOT_READY');
  liveCredentials(settings.credentialFile);
  ensure(/^.+@sha256:[a-f0-9]{64}$/.test(process.env.PAY_IMAGE || ''), 'IMMUTABLE_IMAGE_REQUIRED');
  ensure(process.env.PAY_CALLBACK_VERIFIED === 'true' && process.env.PAY_DEVICE_ACCEPTANCE === 'true'
    && process.env.PAY_NEXT_DAY_BILL_ACCEPTANCE === 'true', 'EXTERNAL_ACCEPTANCE_REQUIRED');
  for (const [scope, name, url] of [['payment', 'PAY_BACKUP_REPORT', settings.pbUrl], ['business', 'BUSINESS_BACKUP_REPORT', process.env.PB_URL]] as const) {
    const path = process.env[name]; ensure(typeof path === 'string' && path.startsWith('/'), 'BACKUP_REPORT_REQUIRED');
    const report = JSON.parse(readFileSync(path, 'utf8'));
    ensure(report.scope === scope && report.sourceUrl === url && report.integrity === 'ok'
      && Date.now() - Date.parse(report.verifiedAt) >= 0 && Date.now() - Date.parse(report.verifiedAt) < 86400000
      && createHash('sha256').update(readFileSync(report.archive)).digest('hex') === report.sha256, 'BACKUP_REPORT_INVALID');
  }
  const root = resolve(import.meta.dir, '../..');
  for (const path of [root, join(root, 'ikanyue.admin'), join(root, 'ikanyue.mapi.hono'), join(root, 'ikanyue.taro3')]) {
    ensure(!execFileSync('git', ['status', '--porcelain'], { cwd: path, encoding: 'utf8' }).trim(), 'UNCOMMITTED_RELEASE_CHANGES');
  }
  return { configuration: 'passed', backups: 'verified', liveChargePerformed: false, trafficSwitched: false };
}
if (import.meta.main) {
  try {
    if (process.argv.includes('--native')) Object.assign(process.env, JSON.parse(readFileSync(resolve(import.meta.dir, '../../.local/native/environment.json'), 'utf8')), { NODE_ENV: 'development' });
    const action = process.argv[2];
    if (action === 'backup') {
      const scope = process.argv[3]; ensure(scope === 'payment' || scope === 'business', 'BACKUP_SCOPE_REQUIRED');
      console.log(JSON.stringify(await backup(scope), null, 2));
    } else if (action === 'preflight') console.log(JSON.stringify(preflight(), null, 2));
    else console.log('Usage: bun scripts/maintenance.ts backup payment|business [--native]\n       bun scripts/maintenance.ts preflight');
  } catch (error) { console.error(error instanceof Error && 'code' in error ? String(error.code) : 'MAINTENANCE_FAILED'); process.exitCode = 1; }
}
