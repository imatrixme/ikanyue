const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MIGRATIONS, main, migrationSource } = require('../scripts/generate-course-credit-migrations');
const { assertNoPocketBaseBusinessHooks } = require('../scripts/verify-no-pocketbase-hooks');
const ROOT = path.resolve(__dirname, '..');

test('backend contains migrations only and no PocketBase business hooks', () => {
    assert.equal(assertNoPocketBaseBusinessHooks(ROOT), true);
});

test('committed PocketBase migrations are deterministic and remain reviewable', () => {
    for (const [filename, schemas] of MIGRATIONS) {
        const file = path.join(ROOT, 'pocketbase/pb_migrations', filename);
        const source = fs.readFileSync(file, 'utf8');
        assert.equal(source, migrationSource(schemas));
        assert.ok(source.split('\n').length < 500, `${filename} must stay below 500 lines`);
        for (const schema of schemas) {
            assert.match(source, new RegExp(`name: ${JSON.stringify(schema.name)}`));
        }
    }
});

test('migration generator writes all deterministic files to an isolated output directory', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'course-credit-migrations-'));
    main(output);
    assert.deepEqual(fs.readdirSync(output).sort(), MIGRATIONS.map(([filename]) => filename).sort());
    for (const [filename, schemas] of MIGRATIONS) {
        assert.equal(fs.readFileSync(path.join(output, filename), 'utf8'), migrationSource(schemas));
    }
});
