const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
    assertNoPocketBaseBusinessHooks,
    findPocketBaseHookViolations,
    main,
} = require('../scripts/verify-no-pocketbase-hooks');

test('hook guard accepts Hono SDK code and migration-only PocketBase assets', () => {
    const root = fixtureRoot();
    write(root, 'src/service.js', "client.createBatch();\n");
    write(root, 'pocketbase/pb_migrations/100_schema.js', "migrate((app) => app.save({}));\n");

    assert.deepEqual(findPocketBaseHookViolations(root), []);
    assert.equal(assertNoPocketBaseBusinessHooks(root), true);
});

test('hook guard rejects hook directories, files, APIs, and runtime config', () => {
    const root = fixtureRoot();
    fs.mkdirSync(path.join(root, 'pb_hooks'), { recursive: true });
    fs.mkdirSync(path.join(root, 'pocketbase', 'pb_hooks'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts', 'nested', 'pb_hooks'), { recursive: true });
    write(root, 'scripts/legacy.pb.js', "onRecordCreateRequest(() => {});\n");
    write(root, 'src/legacy.js', "routerAdd('GET', '/legacy', () => {});\n");
    write(root, 'pocketbase/runtime.yml', 'command: serve --hooksDir=/pb_hooks\n');
    write(root, 'package.json', '{"scripts":{"pb":"pocketbase serve --hooksDir=/pb_hooks"}}\n');

    assert.deepEqual(findPocketBaseHookViolations(root), [
        { type: 'hook-runtime-config', file: 'package.json' },
        { type: 'hook-directory', file: 'pb_hooks' },
        { type: 'hook-directory', file: 'pocketbase/pb_hooks' },
        { type: 'hook-runtime-config', file: 'pocketbase/runtime.yml' },
        { type: 'hook-file', file: 'scripts/legacy.pb.js' },
        { type: 'hook-directory', file: 'scripts/nested/pb_hooks' },
        { type: 'hook-api', file: 'src/legacy.js' },
    ]);
    assert.throws(
        () => assertNoPocketBaseBusinessHooks(root),
        (error) => error.code === 'POCKETBASE_BUSINESS_HOOKS_FORBIDDEN'
            && error.violations.length === 7
    );
});

test('hook guard covers record, bootstrap, serve, cron, and transaction APIs', () => {
    const root = fixtureRoot();
    const APIs = [
        'onRecordUpdateRequest',
        'onBootstrap',
        'onServe',
        'cronAdd',
        'runInTransaction',
    ];
    APIs.forEach((api, index) => write(root, `src/hook-${index}.js`, `${api}(() => {});\n`));

    assert.deepEqual(
        findPocketBaseHookViolations(root).map((item) => item.type),
        APIs.map(() => 'hook-api')
    );
});

test('hook guard CLI reports pass and failure without exiting the process', () => {
    const passingRoot = fixtureRoot();
    const failingRoot = fixtureRoot();
    write(failingRoot, 'src/hook.js', "onServe(() => {});\n");
    const messages = [];
    const logger = {
        log(message) { messages.push(['log', message]); },
        error(message) { messages.push(['error', message]); },
    };

    assert.equal(main(passingRoot, logger), 0);
    assert.equal(main(failingRoot, logger), 1);
    assert.match(messages[0][1], /guard passed/);
    assert.match(messages[1][1], /forbidden/);
});

test('hook guard executable succeeds for the current backend', () => {
    const script = path.resolve(__dirname, '../scripts/verify-no-pocketbase-hooks.js');
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /guard passed/);
});

function fixtureRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'no-pocketbase-hooks-'));
}

function write(root, relativePath, contents) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
}
