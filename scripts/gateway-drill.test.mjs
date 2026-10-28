import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { bucketOf, evaluateLoad, evaluateSoak, histogram, merge, parseDuration, parseMetrics, percentile } from './gateway-drill.mjs';

test('percentiles merge across workers and never flatter', () => {
  const a = histogram(); const b = histogram();
  for (let i = 0; i < 99; i++) a[bucketOf(1000)]++; // 1 ms
  b[bucketOf(50_000)]++; // one 50 ms outlier
  const all = merge(merge(histogram(), a), b);
  assert.ok(percentile(all, 0.5) >= 1 && percentile(all, 0.5) < 1.06);
  assert.ok(percentile(all, 0.99) >= 1 && percentile(all, 0.99) < 1.06);
  assert.ok(percentile(all, 1) >= 50 && percentile(all, 1) < 53);
  assert.equal(percentile(histogram(), 0.99), 0);
});

test('durations and Prometheus text parse', () => {
  assert.equal(parseDuration('500ms'), 500);
  assert.equal(parseDuration('24h'), 86_400_000);
  assert.throws(() => parseDuration('1d'), /Invalid duration/);
  const values = parseMetrics([
    '# TYPE go_goroutines gauge', 'go_goroutines 42',
    'kanyue_gateway_requests_total{stage="RELEASE",code="2xx"} 10', 'kanyue_gateway_requests_total{stage="PRE",code="5xx"} 2',
    'process_resident_memory_bytes 5.24288e+07',
  ].join('\n'));
  assert.deepEqual(values, { go_goroutines: 42, kanyue_gateway_requests_total: 12, process_resident_memory_bytes: 52_428_800 });
});

test('load verdict needs every measurement against the profile', () => {
  const gateway = { qps: 3200, failed: 0, p99Ms: 4.5 };
  const pass = evaluateLoad('1c1g', gateway, { p99Ms: 3 }, { residentBytes: 60 * 2 ** 20 });
  assert.equal(pass.pass, true, JSON.stringify(pass));
  const slow = evaluateLoad('1c1g', gateway, { p99Ms: 2 }, { residentBytes: 60 * 2 ** 20 });
  assert.equal(slow.checks.find((c) => c.check === 'addedP99Ms').pass, false);
  const blind = evaluateLoad('2c4g', gateway, null, null);
  assert.equal(blind.pass, false);
  assert.deepEqual(blind.checks.filter((c) => !c.pass).map((c) => c.check), ['qps', 'addedP99Ms', 'residentMB']);
  assert.throws(() => evaluateLoad('8c', gateway), /Unknown profile/);
});

test('soak verdict ignores warm-up, catches leaks and projects telemetry to retention', () => {
  const run = (resident) => Array.from({ length: 20 }, (_, i) => ({ at: i * 3_600_000, requests: 1000, failed: 0,
    metrics: { residentBytes: resident(i), goroutines: 40, telemetryBytes: 2 ** 20 * (10 + i) } }));
  const steady = evaluateSoak(run((i) => (i < 2 ? 20 : 40) * 2 ** 20)); // grows during warm-up only
  assert.equal(steady.pass, true, JSON.stringify(steady));
  const telemetry = steady.checks.find((c) => c.check === 'telemetryAtRetentionMB');
  assert.equal(telemetry.perHourMB, 1);
  assert.equal(telemetry.got, 10 + 24 * 7);
  const leak = evaluateSoak(run((i) => (40 + 5 * i) * 2 ** 20));
  assert.equal(leak.checks.find((c) => c.check === 'residentGrowth').pass, false);
  const failing = evaluateSoak(run(() => 40 * 2 ** 20).map((s, i) => (i === 3 ? { ...s, failed: 100 } : s)));
  assert.equal(failing.checks.find((c) => c.check === 'errorRate').pass, false);
  assert.equal(evaluateSoak([]).pass, false);
});

// The drill is run end to end against a local server: every request is counted,
// non-2xx answers fail, and the Authorization header is sent but never printed.
test('load runs workers end to end and keeps the authorization out of the output', async () => {
  let authorized = 0; let seen = 0;
  const server = createServer((request, response) => {
    seen++;
    if (request.headers.authorization === 'Bearer drill-secret' && request.headers['x-ca-stage'] === 'PRE') authorized++;
    response.statusCode = seen % 50 === 0 ? 503 : 200;
    response.end('{}');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}/v1/x`;
  const child = spawn(process.execPath, [new URL('./gateway-drill.mjs', import.meta.url).pathname, 'load', '--url', url,
    '--header', 'X-Ca-Stage: PRE', '--duration', '1s', '--connections', '4', '--workers', '2'],
  { env: { ...process.env, DRILL_AUTHORIZATION: 'Bearer drill-secret' } });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { out += chunk; });
  const code = await new Promise((done) => child.on('exit', done));
  server.close();
  assert.equal(code, 0, out);
  const result = JSON.parse(out);
  assert.equal(result.gateway.requests, seen);
  assert.equal(authorized, seen);
  assert.equal(result.gateway.failed, result.gateway.statuses['503']);
  assert.ok(result.gateway.failed > 0 && result.gateway.qps > 0);
  assert.doesNotMatch(out, /drill-secret/);
});
