#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

async function main(options) {
    const argv = normalizeArgv(options.argv);
    const env = options.env;
    const command = argv[0];
    if (!['backup', 'restore', 'restore-finalize'].includes(command)) {
        throw new Error('Usage: course-credit-pocketbase-backup.js <backup|restore|restore-finalize> [file]');
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
    const restoreOptions = {
        env,
        filePath: argv[1],
        fsImpl: options.fsImpl,
        pb,
    };
    return command === 'restore' ? restorePocketBase(restoreOptions) : finalizePocketBaseRestore(restoreOptions);
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
    const originalBackups = await switchToLocalBackupStorage(pb, env);
    let uploaded = false;
    try {
        await pb.backups.upload({ file }, { requestKey: null });
        uploaded = true;
        await pb.backups.restore(basename, { requestKey: null });
        return {
            basename,
            bytes: data.length,
            restoreRequested: true,
            restartRequired: true,
            finalizeRequired: true,
            reenableS3Required: Boolean(originalBackups?.s3?.enabled),
        };
    } catch (error) {
        if (uploaded) await deleteBackupIfPresent(pb, basename, false);
        if (originalBackups) {
            await pb.settings.update({ backups: originalBackups }, { requestKey: null });
        }
        throw error;
    }
}

async function finalizePocketBaseRestore({ env, filePath, pb }) {
    if (!filePath) throw new Error('Restore finalization requires the restored backup zip path');
    const basename = path.basename(path.resolve(filePath));
    if (env.PB_RESTORE_CONFIRM !== basename) {
        throw new Error(`Set PB_RESTORE_CONFIRM=${basename} to confirm restore finalization`);
    }
    const reenableS3 = env.PB_BACKUP_STORAGE === 'local'
        ? explicitBooleanEnv('PB_RESTORE_REENABLE_S3', env)
        : false;
    await refreshPocketBaseAuth(pb, env);
    const settings = env.PB_BACKUP_STORAGE === 'local'
        ? await pb.settings.getAll({ requestKey: null })
        : null;
    const backups = settings?.backups;
    if (backups?.s3?.enabled) {
        await pb.settings.update({
            backups: { ...backups, s3: { ...backups.s3, enabled: false } },
        }, { requestKey: null });
    }
    await deleteBackupIfPresent(pb, basename);
    if (reenableS3 && backups?.s3) {
        await pb.settings.update({
            backups: { ...backups, s3: { ...backups.s3, enabled: true } },
        }, { requestKey: null });
    }
    return { basename, finalized: true, s3Enabled: reenableS3 };
}

async function refreshPocketBaseAuth(pb, env) {
    if (!pb.health?.check || typeof pb.collection !== 'function'
        || !env.PB_EMAIL || !env.PB_PASSWORD) return;
    await pb.health.check({ requestKey: null });
    await pb.collection('_superusers').authWithPassword(
        env.PB_EMAIL, env.PB_PASSWORD, { requestKey: null }
    );
}

async function deleteBackupIfPresent(pb, basename, strict = true) {
    if (!pb.backups?.delete) return;
    try {
        await pb.backups.delete(basename, { requestKey: null });
    } catch (error) {
        if (isMissingBackupError(error) || !strict) return;
        throw error;
    }
}

function isMissingBackupError(error) {
    const message = `${error?.message || ''} ${error?.response?.message || ''}`.toLowerCase();
    return error?.status === 404 || message.includes('already deleted') || message.includes('no such file');
}

function explicitBooleanEnv(name, env) {
    const value = env[name];
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${name} must be explicitly true or false`);
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
    deleteBackupIfPresent,
    explicitBooleanEnv,
    finalizePocketBaseRestore,
    isMissingBackupError,
    main,
    normalizeArgv,
    refreshPocketBaseAuth,
    requiredEnv,
    restorePocketBase,
    switchToLocalBackupStorage,
};
