import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import process from 'node:process'

const [sourcePath, destinationPath] = process.argv.slice(2)
if (!sourcePath || !destinationPath) {
  throw new Error('Usage: backup-1panel-db.mjs SOURCE_DB DESTINATION_DB')
}
if (!fs.existsSync(sourcePath)) throw new Error(`Source database does not exist: ${sourcePath}`)
if (fs.existsSync(destinationPath)) throw new Error(`Destination already exists: ${destinationPath}`)

const source = new DatabaseSync(sourcePath)
const escapedDestination = destinationPath.replaceAll("'", "''")
source.exec(`VACUUM INTO '${escapedDestination}'`)
source.close()

const backup = new DatabaseSync(destinationPath, { readOnly: true })
const integrity = backup.prepare('PRAGMA integrity_check').get()
backup.close()

if (integrity.integrity_check !== 'ok') {
  throw new Error(`Backup integrity check failed: ${JSON.stringify(integrity)}`)
}

process.stdout.write(`${JSON.stringify({ sourcePath, destinationPath, integrity: 'ok' }, null, 2)}\n`)
