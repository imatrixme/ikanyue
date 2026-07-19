#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

async function main(options) {
    const argv = normalizeArgv(options.argv);
    const env = options.env;
    const command = argv[0];
    if (!['backup', 'restore'].includes(command)) {
        throw new Error('Usage: course-credit-pocketbase-backup.js <backup|restore> [file]');
    }
    const pb = options.pb || await connect(env, options.loadPocketBase);
    if (command === 'backup') {
        return backupPocketBase({
            env,
            fetchImpl: options.fetchImpl,
            filePath: argv[1],
            fsImpl: options.fsImpl,
            now: options.now,
            pb,
        });
    }
    return restorePocketBase({
        env,
        filePath: argv[1],
        fsImpl: options.fsImpl,
        pb,
    });
}

function normalizeArgv(argv) {
    return argv[1] === '--' ? [argv[0], ...argv.slice(2)] : argv;
}

async function connect(env, loadPocketBase) {
    const url = env.PB_URL || 'http://127.0.0.1:18091';
    assertLoopback(url);
    const email = requiredEnv('PB_EMAIL', env);
    const password = requiredEnv('PB_PASSWORD', env);
    const PocketBase = await loadPocketBase();
    const pb = new PocketBase.default(url);
    await pb.collection('_superusers').authWithPassword(email, password, { requestKey: null });
    return pb;
}

async function backupPocketBase({ env, fetchImpl, filePath, fsImpl, now, pb }) {
    const basename = backupName(filePath, now());
    const outputPath = path.resolve(filePath || path.join(
        env.COURSE_CREDIT_BACKUP_DIR || '.local/course-credit-backups',
        basename
    ));
    await fsImpl.mkdir(path.dirname(outputPath), { recursive: true });
    const originalBackups = await switchToLocalBackupStorage(pb, env);
    let created = false;
    try {
        await pb.backups.create(basename, { requestKey: null });
        created = true;
        const token = await pb.files.getToken({ requestKey: null });
        const response = await fetchImpl(pb.backups.getDownloadURL(token, basename));
        if (!response.ok) throw new Error(`PocketBase backup download failed with HTTP ${response.status}`);
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length === 0) throw new Error('PocketBase backup download was empty');
        await fsImpl.writeFile(outputPath, data, { flag: 'wx' });
        return { basename, bytes: data.length, outputPath };
    } finally {
        try {
            if (created) await pb.backups.delete(basename, { requestKey: null });
        } finally {
            if (originalBackups) {
                await pb.settings.update({ backups: originalBackups }, { requestKey: null });
            }
        }
    }
}

async function switchToLocalBackupStorage(pb, env) {
    if (env.PB_BACKUP_STORAGE !== 'local') return null;
    const settings = await pb.settings.getAll({ requestKey: null });
    const backups = settings.backups;
    if (!backups?.s3?.enabled) return null;
    await pb.settings.update({
        backups: { ...backups, s3: { ...backups.s3, enabled: false } },
    }, { requestKey: null });
    return backups;
}

async function restorePocketBase({ env, filePath, fsImpl, pb }) {
    if (!filePath) throw new Error('Restore requires a local PocketBase backup zip path');
    const resolved = path.resolve(filePath);
    const basename = path.basename(resolved);
    if (env.PB_RESTORE_CONFIRM !== basename) {
        throw new Error(`Set PB_RESTORE_CONFIRM=${basename} to confirm local restore`);
    }
    const data = await fsImpl.readFile(resolved);
    if (data.length === 0) throw new Error('PocketBase restore file is empty');
    const file = new File([data], basename, { type: 'application/zip' });
    await pb.backups.upload({ file }, { requestKey: null });
    await pb.backups.restore(basename, { requestKey: null });
    return { basename, bytes: data.length, restored: true };
}

function backupName(filePath, now) {
    if (filePath) {
        const basename = path.basename(filePath);
        if (!/^[a-z0-9_-]+\.zip$/.test(basename)) {
            throw new Error('PocketBase backup filename must match ^[a-z0-9_-]+\\.zip$');
        }
        return basename;
    }
    return `course-credit-${new Date(now).toISOString().replaceAll(':', '').replaceAll('.', '').toLowerCase()}.zip`;
}

function assertLoopback(value) {
    const hostname = new URL(value).hostname;
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) {
        throw new Error(`Refusing PocketBase backup operation against non-loopback host ${hostname}`);
    }
}

function requiredEnv(name, env) {
    if (!env[name]) throw new Error(`${name} is required`);
    return env[name];
}

/* c8 ignore start */
if (require.main === module) {
    main({
        argv: process.argv.slice(2),
        env: process.env,
        fetchImpl: fetch,
        fsImpl: fs,
        loadPocketBase: () => import('pocketbase'),
        now: Date.now,
    }).then((result) => console.log(JSON.stringify(result))).catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
/* c8 ignore stop */

module.exports = {
    assertLoopback,
    backupName,
    backupPocketBase,
    connect,
    main,
    normalizeArgv,
    requiredEnv,
    restorePocketBase,
    switchToLocalBackupStorage,
};
