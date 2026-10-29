// The gateway exposes on mapi.ikanyue.com exactly what the mini program calls:
// kanyue.gateway/internal/exposure/mapi.json must match the iNet calls in
// ikanyue.mini/miniprogram/services. kanyue.server's manifest test checks the same file
// against the operations it serves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const miniapp = join(root, 'ikanyue.mini/miniprogram');
const services = join(miniapp, 'services');

// Calls the production server never serves, so the plan leaves them out.
const developmentOnly = new Set([
  'POST /v1/student/commerce/orders/{}/mock-pay', // registered only with PAY_MOCK_ENABLED outside production
]);

const shape = (pattern) => pattern.replace(/\{[^}]*\}/g, '{}');

function miniappCalls() {
  const calls = new Set();
  for (const name of readdirSync(services).filter((file) => file.endsWith('.js'))) {
    const source = readFileSync(join(services, name), 'utf8');
    const constants = Object.fromEntries([...source.matchAll(/const (\w+) = '([^']*)'/g)].map((m) => [m[1], m[2]]));
    for (const m of source.matchAll(/iNet\.(get|post|put|patch|delete)\(\s*(['`])([^'`]*)\2/g)) {
      calls.add(shape(`${m[1].toUpperCase()} ${m[3].replace(/\$\{(\w+)\}/g, (_, id) => constants[id] ?? '{}')}`));
    }
  }
  return calls;
}

test('mapi exposure plan equals the mini program calls', () => {
  const plan = JSON.parse(readFileSync(join(root, 'kanyue.gateway/internal/exposure/mapi.json'), 'utf8'));
  assert.equal(plan.group, 'mapi');
  assert.deepEqual(plan.domains, ['mapi.ikanyue.com']);
  const exposed = new Set(plan.apis.flatMap((batch) => batch.operations).map(shape));
  const calls = miniappCalls();
  assert.ok(calls.size > 40, `only ${calls.size} calls found; the scan is incomplete`);
  const missing = [...calls].filter((call) => !exposed.has(call) && !developmentOnly.has(call)).sort();
  const unused = [...exposed].filter((op) => !calls.has(op)).sort();
  assert.deepEqual({ missing, unused }, { missing: [], unused: [] });
});

test('mini program calls only go through iNet in services', () => {
  // Pages calling iNet or kit request directly would bypass the scan above.
  const skip = new Set([services, join(miniapp, 'kit')]);
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (!skip.has(path)) walk(path); }
      else if (entry.name.endsWith('.js') && /wx\.request\(|iNet\.(get|post|put|patch|delete)\(|import \{[^}]*\brequest\b[^}]*\} from '[./]*kit\/api\.js'/.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(root.length));
    }
  };
  walk(miniapp);
  assert.deepEqual(offenders, []);
});
