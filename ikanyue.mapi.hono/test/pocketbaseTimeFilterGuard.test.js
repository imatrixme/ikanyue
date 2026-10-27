const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { filterTime } = require('../src/services/courseCredits/repositories/operationRepository');

const SRC = path.join(__dirname, '..', 'src');
const TIME_COMPARISON = /[A-Za-z.]*(?:At|Date|Deadline|From|To|created|updated)\s*[<>]=?\s*"\$\{([^}]*)\}/g;

function sourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return entry.name.endsWith('.js') ? [full] : [];
    });
}

function normalizedVariable(source, expression) {
    const name = expression.trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return false;
    return new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*[^;]*\\bfilterTime\\(`).test(source);
}

test('filterTime renders instants in the PocketBase stored format', () => {
    assert.equal(filterTime('2026-10-22T01:00:00.000Z'), '2026-10-22 01:00:00.000Z');
    assert.equal(filterTime('2026-10-22T09:00:00+08:00'), '2026-10-22 01:00:00.000Z');
    assert.equal(filterTime(Date.parse('2026-10-22T01:00:00.000Z')), '2026-10-22 01:00:00.000Z');
    assert.equal(filterTime(new Date('2026-10-22T01:00:00.000Z')), '2026-10-22 01:00:00.000Z');
    assert.equal(filterTime(''), '');
    assert.equal(filterTime(undefined), '');
});

test('every interpolated time comparison in a filter goes through filterTime', () => {
    const offenders = [];
    for (const file of sourceFiles(SRC)) {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(TIME_COMPARISON)) {
            if (match[1].includes('filterTime(') || normalizedVariable(source, match[1])) continue;
            offenders.push(`${path.relative(SRC, file)}: ${match[0]}`);
        }
    }
    assert.deepEqual(offenders, []);
});
