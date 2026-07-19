import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function valueAfter(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? '' : args[index + 1] || ''
}

const args = process.argv.slice(2)
const databasePath = valueAfter(args, '--database')
const backupPath = valueAfter(args, '--backup')
const domain = valueAfter(args, '--domain')
const proxy = valueAfter(args, '--proxy')
const apply = args.includes('--apply')

if (!databasePath || !domain || !proxy) {
  throw new Error('Usage: onepanel-site-metadata.mjs --database DB --domain DOMAIN --proxy URL [--backup DB --apply]')
}
if (!fs.existsSync(databasePath)) throw new Error(`Database does not exist: ${databasePath}`)

if (apply) {
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error('--apply requires an existing --backup database')
  }
  if (path.resolve(backupPath) === path.resolve(databasePath)) {
    throw new Error('--backup must be a separate database file')
  }
  const backup = new DatabaseSync(backupPath, { readOnly: true })
  const integrity = backup.prepare('PRAGMA integrity_check').get()
  const backupSite = backup.prepare('SELECT id, primary_domain, type, proxy FROM websites WHERE primary_domain = ?').get(domain)
  backup.close()
  if (integrity.integrity_check !== 'ok') throw new Error('Backup integrity check failed')
  if (!backupSite) throw new Error(`Backup does not contain website: ${domain}`)
}

const database = new DatabaseSync(databasePath, { readOnly: !apply })
const columns = database.prepare('PRAGMA table_info(websites)').all().map(column => column.name)
for (const required of ['id', 'primary_domain', 'type', 'proxy', 'proxy_type', 'updated_at']) {
  if (!columns.includes(required)) throw new Error(`Unsupported 1Panel schema: missing websites.${required}`)
}

const before = database.prepare('SELECT id, primary_domain, type, proxy FROM websites WHERE primary_domain = ?').all(domain)
if (before.length !== 1) throw new Error(`Expected one website row for ${domain}, received ${before.length}`)

if (!apply) {
  database.close()
  process.stdout.write(`${JSON.stringify({ mode: 'dry-run', before: before[0], desired: { type: 'proxy', proxy } }, null, 2)}\n`)
  process.exit(0)
}

database.exec('BEGIN IMMEDIATE')
try {
  const result = database.prepare(`
    UPDATE websites
    SET type = ?, proxy = ?, proxy_type = ?, updated_at = ?
    WHERE id = ?
  `).run('proxy', proxy, '', new Date().toISOString(), before[0].id)
  if (result.changes !== 1) throw new Error(`Expected one updated row, received ${result.changes}`)
  database.exec('COMMIT')
} catch (error) {
  database.exec('ROLLBACK')
  throw error
}

const after = database.prepare('SELECT id, primary_domain, type, proxy FROM websites WHERE id = ?').get(before[0].id)
database.close()
if (after.type !== 'proxy' || after.proxy !== proxy) {
  throw new Error(`Unexpected final metadata: ${JSON.stringify(after)}`)
}

process.stdout.write(`${JSON.stringify({ mode: 'apply', before: before[0], after }, null, 2)}\n`)
