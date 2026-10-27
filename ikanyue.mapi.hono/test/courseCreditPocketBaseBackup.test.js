const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../scripts/course-credit-pocketbase-backup');

test('backup command creates, downloads, writes, and removes the temporary server backup', async () => {
    const state = backupState();
    const result = await backupPocketBase({
        env: {},
        fetchImpl: async (url) => {
            state.calls.push(['fetch', url]);
            return { ok: true, async arrayBuffer() { return Buffer.from('backup'); } };
        },
        filePath: '/tmp/course-credit-test.zip',
        fsImpl: state.fs,
        now: () => 0,
        pb: state.pb,
    });
    assert.deepEqual(result, {
        basename: 'course-credit-test.zip', bytes: 6, outputPath: '/tmp/course-credit-test.zip',
    });
    assert.deepEqual(state.calls, [
        ['mkdir', '/tmp', { recursive: true }],
        ['create', 'course-credit-test.zip', { requestKey: null }],
        ['token', { requestKey: null }],
        ['url', 'token', 'course-credit-test.zip'],
        ['fetch', 'http://backup.local/course-credit-test.zip'],
        ['write', '/tmp/course-credit-test.zip', 'backup', { flag: 'wx' }],
        ['delete', 'course-credit-test.zip', { requestKey: null }],
    ]);
});

test('backup cleanup runs after failed or empty downloads', async () => {
    for (const response of [
        { ok: false, status: 503 },
        { ok: true, async arrayBuffer() { return Buffer.alloc(0); } },
    ]) {
        const state = backupState();
        await assert.rejects(backupPocketBase({
            env: {}, fetchImpl: async () => response, filePath: '/tmp/failure.zip',
            fsImpl: state.fs, now: () => 0, pb: state.pb,
        }), /failed|empty/);
        assert.equal(state.calls.at(-1)[0], 'delete');
    }
});

test('forced local backup storage restores the original S3 settings after completion', async () => {
    const state = backupState();
    const backups = { cron: '0 0 * * *', s3: { enabled: true, bucket: 'production' } };
    state.pb.settings = {
        async getAll(options) { state.calls.push(['settings:get', options]); return { backups }; },
        async update(payload, options) { state.calls.push(['settings:update', payload, options]); },
    };
    await backupPocketBase({
        env: { PB_BACKUP_STORAGE: 'local' },
        fetchImpl: async () => ({ ok: true, async arrayBuffer() { return Buffer.from('local'); } }),
        filePath: '/tmp/local.zip',
        fsImpl: state.fs,
        now: () => 0,
        pb: state.pb,
    });
    const updates = state.calls.filter((call) => call[0] === 'settings:update');
    assert.equal(updates[0][1].backups.s3.enabled, false);
    assert.equal(updates[1][1].backups, backups);

    assert.equal(await switchToLocalBackupStorage(state.pb, {}), null);
    state.pb.settings.getAll = async () => ({ backups: { s3: { enabled: false } } });
    assert.equal(await switchToLocalBackupStorage(state.pb, { PB_BACKUP_STORAGE: 'local' }), null);

    const failed = backupState();
    failed.pb.settings = {
        async getAll() { return { backups }; },
        async update(payload) { failed.calls.push(['settings:update', payload]); },
    };
    failed.pb.backups.create = async () => { throw new Error('create failed'); };
    await assert.rejects(backupPocketBase({
        env: { PB_BACKUP_STORAGE: 'local' }, fetchImpl: async () => null,
        filePath: '/tmp/create-failed.zip', fsImpl: failed.fs, now: () => 0, pb: failed.pb,
    }), /create failed/);
    assert.equal(failed.calls.filter((call) => call[0] === 'settings:update').length, 2);
});

test('restore requires explicit filename confirmation before upload and restore', async () => {
    const calls = [];
    const fsImpl = { async readFile(filePath) { calls.push(['read', filePath]); return Buffer.from('zip'); } };
    const pb = {
        backups: {
            async upload(body, options) {
                calls.push(['upload', body.file.name, body.file.size, options]);
            },
            async restore(name, options) { calls.push(['restore', name, options]); },
        },
    };
    await assert.rejects(restorePocketBase({
        env: {}, filePath: '/tmp/restore.zip', fsImpl, pb,
    }), /PB_RESTORE_CONFIRM/);
    const result = await restorePocketBase({
        env: { PB_RESTORE_CONFIRM: 'restore.zip' }, filePath: '/tmp/restore.zip', fsImpl, pb,
    });
    assert.deepEqual(result, {
        basename: 'restore.zip', bytes: 3, restoreRequested: true,
        restartRequired: true, finalizeRequired: true, reenableS3Required: false,
    });
    assert.deepEqual(calls, [
        ['read', '/tmp/restore.zip'],
        ['upload', 'restore.zip', 3, { requestKey: null }],
        ['restore', 'restore.zip', { requestKey: null }],
    ]);
    await assert.rejects(restorePocketBase({
        env: { PB_RESTORE_CONFIRM: 'empty.zip' }, filePath: '/tmp/empty.zip',
        fsImpl: { async readFile() { return Buffer.alloc(0); } }, pb,
    }), /empty/);
});

test('forced local restore preserves the upload and local storage until restart finalization', async () => {
    const calls = [];
    const backups = { cron: '0 0 * * *', s3: { enabled: true, bucket: 'production' } };
    const pb = {
        settings: {
            async getAll(options) { calls.push(['settings:get', options]); return { backups }; },
            async update(payload, options) { calls.push(['settings:update', payload, options]); },
        },
        backups: {
            async upload() { calls.push(['upload']); },
            async restore() { calls.push(['restore']); },
        },
    };
    const result = await restorePocketBase({
        env: {
            PB_RESTORE_CONFIRM: 'restore.zip', PB_BACKUP_STORAGE: 'local',
            PB_EMAIL: 'admin@example.com', PB_PASSWORD: 'secret',
        },
        filePath: '/tmp/restore.zip',
        fsImpl: { async readFile() { return Buffer.from('zip'); } },
        pb,
    });
    assert.equal(result.restoreRequested, true);
    assert.equal(result.reenableS3Required, true);
    const updates = calls.filter((call) => call[0] === 'settings:update');
    assert.equal(updates[0][1].backups.s3.enabled, false);
    assert.equal(updates.length, 1);
    assert.deepEqual(calls.filter((call) => ['upload', 'restore'].includes(call[0]))
        .map((call) => call[0]), ['upload', 'restore']);
});

test('restore finalization cleans the staged backup and explicitly restores S3', async () => {
    const calls = [];
    const backups = { cron: '0 0 * * *', s3: { enabled: false, bucket: 'production' } };
    const pb = {
        settings: {
            async getAll(options) { calls.push(['settings:get', options]); return { backups }; },
            async update(payload, options) { calls.push(['settings:update', payload, options]); },
        },
        health: { async check(options) { calls.push(['health', options]); } },
        collection(name) {
            assert.equal(name, '_superusers');
            return { async authWithPassword(...args) { calls.push(['auth', ...args]); } };
        },
        backups: { async delete(...args) { calls.push(['delete', ...args]); } },
    };
    const result = await finalizePocketBaseRestore({
        env: {
            PB_RESTORE_CONFIRM: 'restore.zip', PB_BACKUP_STORAGE: 'local',
            PB_RESTORE_REENABLE_S3: 'true', PB_EMAIL: 'admin@example.com', PB_PASSWORD: 'secret',
        },
        filePath: '/tmp/restore.zip',
        pb,
    });
    assert.deepEqual(result, { basename: 'restore.zip', finalized: true, s3Enabled: true });
    assert.deepEqual(calls.map((call) => call[0]), [
        'health', 'auth', 'settings:get', 'delete', 'settings:update',
    ]);
    assert.equal(calls.at(-1)[1].backups.s3.enabled, true);
});

test('restore cleanup tolerates PocketBase missing-file responses', async () => {
    assert.equal(isMissingBackupError({ status: 404 }), true);
    assert.equal(isMissingBackupError({ status: 400, message: 'backup already deleted' }), true);
    assert.equal(isMissingBackupError({ status: 400, response: { message: 'no such file' } }), true);
    assert.equal(isMissingBackupError({ status: 500, message: 'failed' }), false);
    assert.equal(explicitBooleanEnv('FLAG', { FLAG: 'true' }), true);
    assert.equal(explicitBooleanEnv('FLAG', { FLAG: 'false' }), false);
    assert.throws(() => explicitBooleanEnv('FLAG', {}), /explicitly/);
    await deleteBackupIfPresent({ backups: { async delete() {
        throw { status: 400, message: 'backup already deleted' };
    } } }, 'missing.zip');
    await refreshPocketBaseAuth({}, {});
});

test('backup CLI validates command, loopback credentials, names, and injected connection', async () => {
    assert.throws(() => assertLoopback('https://data.example.com'), /non-loopback/);
    assert.doesNotThrow(() => assertLoopback('http://localhost:8090'));
    assert.throws(() => requiredEnv('PB_EMAIL', {}), /PB_EMAIL/);
    assert.equal(requiredEnv('PB_EMAIL', { PB_EMAIL: 'admin@example.com' }), 'admin@example.com');
    assert.throws(() => backupName('/tmp/not-zip', 0), /.zip/);
    assert.throws(() => backupName('/tmp/UPPER.zip', 0), /must match/);
    assert.match(backupName(null, 0), /^course-credit-1970-01-01t000000000z.zip$/);
    assert.deepEqual(normalizeArgv(['backup', '--', '/tmp/file.zip']), ['backup', '/tmp/file.zip']);
    assert.deepEqual(normalizeArgv(['backup', '/tmp/file.zip']), ['backup', '/tmp/file.zip']);
    await assert.rejects(main({ argv: ['unknown'], env: {} }), /Usage/);

    const authCalls = [];
    const connected = await connect({
        PB_URL: 'http://127.0.0.1:8090', PB_EMAIL: 'admin', PB_PASSWORD: 'secret',
    }, async () => ({ default: class PocketBase {
        constructor(url) { this.url = url; }
        collection(name) {
            return { authWithPassword: async (...args) => authCalls.push([this.url, name, ...args]) };
        }
    } }));
    assert.equal(connected.url, 'http://127.0.0.1:8090');
    assert.deepEqual(authCalls[0], [
        'http://127.0.0.1:8090', '_superusers', 'admin', 'secret', { requestKey: null },
    ]);
});

test('main routes backup and restore commands through injected local dependencies', async () => {
    const backup = backupState();
    const backupResult = await main({
        argv: ['backup'],
        env: { COURSE_CREDIT_BACKUP_DIR: '/safe/backups' },
        fetchImpl: async () => ({ ok: true, async arrayBuffer() { return Buffer.from('main'); } }),
        fsImpl: backup.fs,
        now: () => 0,
        pb: backup.pb,
    });
    assert.equal(backupResult.outputPath, '/safe/backups/course-credit-1970-01-01t000000000z.zip');

    const calls = [];
    const restoreResult = await main({
        argv: ['restore', '/safe/restore.zip'],
        env: { PB_RESTORE_CONFIRM: 'restore.zip' },
        fsImpl: { async readFile() { return Buffer.from('main'); } },
        pb: {
            backups: {
                async upload() { calls.push('upload'); },
                async restore() { calls.push('restore'); },
            },
        },
    });
    assert.equal(restoreResult.restoreRequested, true);
    assert.deepEqual(calls, ['upload', 'restore']);
    const finalized = await main({
        argv: ['restore-finalize', '/safe/restore.zip'],
        env: { PB_RESTORE_CONFIRM: 'restore.zip' },
        fsImpl: {},
        pb: { backups: { async delete() { calls.push('delete'); } } },
    });
    assert.equal(finalized.finalized, true);
    assert.deepEqual(calls, ['upload', 'restore', 'delete']);
    await assert.rejects(restorePocketBase({ env: {}, fsImpl: {}, pb: {} }), /requires/);
});

test('main can connect through the injected SDK loader and use the default backup directory', async () => {
    const state = backupState();
    class PocketBase {
        constructor(url) {
            this.url = url;
            this.backups = state.pb.backups;
            this.files = state.pb.files;
        }

        collection() {
            return { async authWithPassword() {} };
        }
    }
    const result = await main({
        argv: ['backup'],
        env: { PB_EMAIL: 'admin', PB_PASSWORD: 'secret' },
        fetchImpl: async () => ({ ok: true, async arrayBuffer() { return Buffer.from('sdk'); } }),
        fsImpl: state.fs,
        loadPocketBase: async () => ({ default: PocketBase }),
        now: () => 0,
    });
    assert.equal(result.outputPath.endsWith('/.local/course-credit-backups/course-credit-1970-01-01t000000000z.zip'), true);
});

function backupState() {
    const calls = [];
    return {
        calls,
        fs: {
            async mkdir(...args) { calls.push(['mkdir', ...args]); },
            async writeFile(filePath, data, options) {
                calls.push(['write', filePath, data.toString(), options]);
            },
        },
        pb: {
            backups: {
                async create(...args) { calls.push(['create', ...args]); },
                async delete(...args) { calls.push(['delete', ...args]); },
                getDownloadURL(...args) {
                    calls.push(['url', ...args]);
                    return `http://backup.local/${args[1]}`;
                },
            },
            files: { async getToken(...args) { calls.push(['token', ...args]); return 'token'; } },
        },
    };
}
