#!/usr/bin/env node
// Target-machine drills for kanyue.gateway: a load test against the release
// targets, a long soak that watches the gateway's memory and telemetry, and a
// rollout under load that counts every failed request. No dependencies.
// Secrets come from the environment only and are never printed:
//   DRILL_AUTHORIZATION   Authorization header sent with every request
//   DRILL_METRICS_TOKEN   viewer token for /gateway/v1/prometheus
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '..');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// Release gates from add-kanyue-gateway design D9: 1 KB responses, default plugin chain.
const profiles = {
  '1c1g': { qps: 3000, addedP99Ms: 2, residentMB: 100 },
  '2c4g': { qps: 10000, addedP99Ms: 1, residentMB: 150 },
};

// Latency histogram: about 5% wide buckets from 1 µs to over a minute, mergeable across workers.
const BUCKETS = 400;
const bucketOf = (micros) => Math.min(BUCKETS - 1, Math.max(0, Math.round(Math.log(Math.max(micros, 1)) * 20)));
const histogram = () => new Array(BUCKETS).fill(0);
function merge(into, from) {
  for (let i = 0; i < BUCKETS; i++) into[i] += from[i];
  return into;
}
// percentile in milliseconds, at the bucket's upper edge so it never flatters.
function percentile(hist, q) {
  const total = hist.reduce((sum, n) => sum + n, 0);
  if (!total) return 0;
  let seen = 0;
  for (let i = 0; i < BUCKETS; i++) {
    seen += hist[i];
    if (seen >= q * total) return Math.exp((i + 0.5) / 20) / 1000;
  }
  return Math.exp((BUCKETS - 0.5) / 20) / 1000;
}

// A window is what the workers saw in one interval: latencies, statuses and network errors.
const emptyWindow = () => ({ hist: histogram(), requests: 0, ok: 0, statuses: {}, errors: {} });
function mergeWindow(into, from) {
  merge(into.hist, from.hist);
  into.requests += from.requests;
  into.ok += from.ok;
  for (const [key, n] of Object.entries(from.statuses)) into.statuses[key] = (into.statuses[key] || 0) + n;
  for (const [key, n] of Object.entries(from.errors)) into.errors[key] = (into.errors[key] || 0) + n;
  return into;
}
const failures = (window) => window.requests - window.ok;
function summarize(window, seconds) {
  return { requests: window.requests, failed: failures(window), qps: Math.round(window.requests / seconds),
    p50Ms: round(percentile(window.hist, 0.5)), p99Ms: round(percentile(window.hist, 0.99)),
    statuses: window.statuses, errors: window.errors };
}
const round = (value, digits = 2) => Number(value.toFixed(digits));

function parseDuration(text) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(text));
  if (!match) throw new Error(`Invalid duration ${text}; use e.g. 500ms, 60s, 10m, 24h`);
  return Number(match[1]) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[match[2]];
}

// parseMetrics sums each unlabelled or labelled sample by metric name.
function parseMetrics(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})? (\S+)$/.exec(line);
    if (match && Number.isFinite(Number(match[2]))) values[match[1]] = (values[match[1]] || 0) + Number(match[2]);
  }
  return values;
}
async function scrape(url) {
  if (!url) return null;
  const headers = process.env.DRILL_METRICS_TOKEN ? { Authorization: `Bearer ${process.env.DRILL_METRICS_TOKEN}` } : {};
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const values = parseMetrics(await response.text());
    return { residentBytes: values.process_resident_memory_bytes ?? values.go_memstats_sys_bytes,
      heapBytes: values.go_memstats_heap_inuse_bytes, goroutines: values.go_goroutines,
      telemetryBytes: values.kanyue_gateway_telemetry_bytes, logDropped: values.kanyue_gateway_log_dropped_total };
  } catch (error) {
    return { error: error.message };
  }
}

// evaluateLoad checks one load result against a profile; addedP99Ms needs a direct baseline.
function evaluateLoad(profile, gateway, direct, metrics) {
  const target = profiles[profile];
  if (!target) throw new Error(`Unknown profile ${profile}; use ${Object.keys(profiles).join(' or ')}`);
  const checks = [
    { check: 'qps', want: `>= ${target.qps}`, got: gateway.qps, pass: gateway.qps >= target.qps },
    { check: 'failed', want: '0', got: gateway.failed, pass: gateway.failed === 0 },
  ];
  if (direct) {
    const added = round(gateway.p99Ms - direct.p99Ms);
    checks.push({ check: 'addedP99Ms', want: `< ${target.addedP99Ms}`, got: added, pass: added < target.addedP99Ms });
  } else {
    checks.push({ check: 'addedP99Ms', want: `< ${target.addedP99Ms}`, got: 'not measured: pass --direct', pass: false });
  }
  const resident = metrics?.residentBytes;
  checks.push(resident === undefined
    ? { check: 'residentMB', want: `< ${target.residentMB}`, got: 'not measured: pass --metrics', pass: false }
    : { check: 'residentMB', want: `< ${target.residentMB}`, got: round(resident / 2 ** 20, 1), pass: resident / 2 ** 20 < target.residentMB });
  return { profile, pass: checks.every((item) => item.pass), checks };
}

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined;
};
// evaluateSoak compares the end of the run with its settled start (after the
// first tenth), so warm-up growth is not counted as a leak, and projects the
// telemetry database to its retention window.
function evaluateSoak(samples, { retentionDays = 7, diskBudgetMB = 1024, maxErrorRate = 0.001, maxGrowth = 1.25 } = {}) {
  const requests = samples.reduce((sum, s) => sum + s.requests, 0);
  const failed = samples.reduce((sum, s) => sum + s.failed, 0);
  const tenth = Math.max(1, Math.floor(samples.length / 10));
  const early = samples.slice(tenth, 2 * tenth);
  const late = samples.slice(-tenth);
  const pick = (list, key) => median(list.map((s) => s.metrics?.[key]));
  const checks = [{ check: 'errorRate', want: `<= ${maxErrorRate}`, got: requests ? round(failed / requests, 5) : 'no requests',
    pass: requests > 0 && failed / requests <= maxErrorRate }];
  for (const [key, label, slack] of [['residentBytes', 'residentGrowth', 0], ['goroutines', 'goroutineGrowth', 50]]) {
    const before = pick(early, key); const after = pick(late, key);
    checks.push(before === undefined || after === undefined || samples.length < 10
      ? { check: label, want: `<= x${maxGrowth}`, got: 'not measured: needs --metrics and 10+ samples', pass: false }
      : { check: label, want: `<= x${maxGrowth}`, got: round(after / before, 3), pass: after <= before * maxGrowth + slack });
  }
  const first = samples.find((s) => Number.isFinite(s.metrics?.telemetryBytes));
  const last = samples.findLast((s) => Number.isFinite(s.metrics?.telemetryBytes));
  if (first && last && last.at > first.at) {
    const perHour = (last.metrics.telemetryBytes - first.metrics.telemetryBytes) / ((last.at - first.at) / 3_600_000);
    const projected = (first.metrics.telemetryBytes + Math.max(0, perHour) * 24 * retentionDays) / 2 ** 20;
    checks.push({ check: 'telemetryAtRetentionMB', want: `< ${diskBudgetMB}`, got: round(projected, 1), pass: projected < diskBudgetMB,
      perHourMB: round(perHour / 2 ** 20, 2) });
  } else {
    checks.push({ check: 'telemetryAtRetentionMB', want: `< ${diskBudgetMB}`, got: 'not measured: needs --metrics', pass: false });
  }
  return { pass: checks.every((item) => item.pass), requests, failed, checks };
}

function parseArgs(argv) {
  const options = { headers: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { (options._ ||= []).push(arg); continue; }
    const [key, inline] = arg.slice(2).split(/=(.*)/s);
    const value = inline ?? argv[++i];
    if (key === 'header') options.headers.push(value);
    else options[key] = value;
  }
  return options;
}
function requestHeaders(list) {
  const headers = {};
  for (const line of list) {
    const at = line.indexOf(':');
    if (at < 1) throw new Error(`Invalid --header ${line}; use "Name: value"`);
    headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  if (process.env.DRILL_AUTHORIZATION) headers.Authorization = process.env.DRILL_AUTHORIZATION;
  return headers;
}

// run starts the workers and calls onWindow with each merged interval until the duration
// (or stop()) ends; rate 0 sends as fast as the connections allow.
async function run({ url, headers, connections, workers, rate = 0, durationMs, intervalMs = 1000, onWindow = () => {} }) {
  const threads = [];
  const exited = [];
  const total = emptyWindow();
  let current = emptyWindow();
  const flush = () => {
    const window = current;
    current = emptyWindow();
    mergeWindow(total, window);
    onWindow(window);
  };
  const count = Math.max(1, Math.min(workers, connections));
  for (let i = 0; i < count; i++) {
    const share = Math.floor(connections / count) + (i < connections % count ? 1 : 0);
    const thread = new Worker(script, { workerData: { url, headers, connections: share, rate: rate * share / connections, intervalMs } });
    thread.on('message', (part) => mergeWindow(current, part));
    exited.push(new Promise((done, fail) => { thread.on('exit', done); thread.on('error', fail); }));
    threads.push(thread);
  }
  const timer = setInterval(flush, intervalMs);
  let stop;
  const stopped = new Promise((done) => { stop = done; });
  const deadline = durationMs ? setTimeout(stop, durationMs) : null;
  const done = (async () => {
    await stopped;
    clearTimeout(deadline);
    for (const thread of threads) thread.postMessage('stop');
    await Promise.all(exited);
    clearInterval(timer);
    flush();
    return total;
  })();
  return { stop, done };
}

// worker drives its connections; each keeps one request in flight, paced when a rate is set.
async function worker({ url, headers, connections, rate, intervalMs }) {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  const agent = new client.Agent({ keepAlive: true, maxSockets: connections });
  let window = emptyWindow();
  let running = true;
  parentPort.on('message', (message) => { if (message === 'stop') running = false; });
  const report = () => { parentPort.postMessage(window); window = emptyWindow(); };
  const timer = setInterval(report, intervalMs);
  const once = () => new Promise((done) => {
    const started = process.hrtime.bigint();
    const request = client.request(target, { method: 'GET', headers, agent }, (response) => {
      response.on('data', () => {});
      response.on('end', () => {
        window.hist[bucketOf(Number(process.hrtime.bigint() - started) / 1000)]++;
        window.requests++;
        const status = String(response.statusCode);
        window.statuses[status] = (window.statuses[status] || 0) + 1;
        if (response.statusCode >= 200 && response.statusCode < 300) window.ok++;
        done();
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error('timeout')));
    request.on('error', (error) => {
      window.requests++;
      const code = error.code || error.message;
      window.errors[code] = (window.errors[code] || 0) + 1;
      done();
    });
    request.end();
  });
  const perConnection = rate > 0 ? rate / connections : 0;
  await Promise.all(Array.from({ length: connections }, async (_, index) => {
    const start = performance.now() + (perConnection ? (index / connections) * (1000 / perConnection) : 0);
    for (let n = 0; running; n++) {
      if (perConnection) {
        const wait = start + n * (1000 / perConnection) - performance.now();
        if (wait > 0) await pause(wait);
        if (!running) break;
      }
      await once();
    }
  }));
  clearInterval(timer);
  report();
  agent.destroy();
  parentPort.close(); // the stop listener would keep the thread alive
}

function common(options) {
  if (!options.url) throw new Error('--url is required');
  return { url: options.url, headers: requestHeaders(options.headers), connections: Number(options.connections || 32),
    workers: Number(options.workers || availableParallelism()) };
}

async function load(options) {
  const base = common(options);
  const durationMs = parseDuration(options.duration || '60s');
  const measure = async (url) => {
    const started = Date.now();
    const total = await (await run({ ...base, url, durationMs })).done;
    return summarize(total, (Date.now() - started) / 1000);
  };
  const direct = options.direct ? await measure(options.direct) : null;
  const gateway = await measure(base.url);
  const metrics = await scrape(options.metrics);
  const result = { gateway, direct, metrics };
  if (options.profile) result.verdict = evaluateLoad(options.profile, gateway, direct, metrics);
  return result;
}

async function soak(options) {
  const base = common(options);
  const durationMs = parseDuration(options.duration || '24h');
  const intervalMs = parseDuration(options.interval || '60s');
  const samples = [];
  let latest = Promise.resolve();
  const started = Date.now();
  const running = await run({ ...base, rate: Number(options.rate || 200), durationMs, intervalMs, onWindow: (window) => {
    latest = latest.then(async () => {
      const sample = { at: Date.now(), ...summarize(window, intervalMs / 1000), metrics: await scrape(options.metrics) };
      samples.push(sample);
      if (options.out) appendFileSync(options.out, `${JSON.stringify(sample)}\n`, { mode: 0o600 });
      console.error(`${new Date(sample.at).toISOString()} ${sample.qps} req/s p99 ${sample.p99Ms} ms failed ${sample.failed}`
        + (sample.metrics?.residentBytes ? ` rss ${round(sample.metrics.residentBytes / 2 ** 20, 1)} MB` : ''));
    });
  } });
  await running.done;
  await latest;
  return { minutes: round((Date.now() - started) / 60_000, 1), samples: samples.length,
    verdict: evaluateSoak(samples, { retentionDays: Number(options['retention-days'] || 7),
      diskBudgetMB: Number(options['disk-budget-mb'] || 1024) }) };
}

// rollout runs steady load around the rollout command and counts what failed while it ran.
async function rollout(options) {
  const base = common(options);
  const command = options.command || 'node scripts/gateway-rollout.mjs';
  const settleMs = parseDuration(options.settle || '10s');
  const running = await run({ ...base, rate: Number(options.rate || 200), durationMs: 0 });
  await pause(settleMs);
  const started = Date.now();
  const code = await new Promise((done) => {
    // The command's output goes to stderr so stdout stays one JSON result.
    const child = spawn(command, { cwd: root, shell: true, stdio: ['ignore', 2, 2] });
    child.on('exit', (status) => done(status ?? 1));
    child.on('error', () => done(1));
  });
  await pause(settleMs);
  running.stop();
  const total = await running.done;
  const summary = summarize(total, (Date.now() - started) / 1000 + settleMs / 1000);
  return { command, exitCode: code, ...summary, pass: code === 0 && summary.failed === 0 };
}

const usage = `Usage: node scripts/gateway-drill.mjs <load|soak|rollout> --url <URL> [options]
  --header "Name: value"   repeatable (e.g. "X-Ca-Stage: PRE"); Authorization comes from DRILL_AUTHORIZATION
  --connections 32 --workers <cpus>
  --metrics <admin>/gateway/v1/prometheus   viewer token in DRILL_METRICS_TOKEN
load:    --duration 60s [--direct <upstream URL>] [--profile 1c1g|2c4g]   exits 1 when the profile fails
soak:    --rate 200 --duration 24h --interval 60s [--out soak.jsonl] [--retention-days 7] [--disk-budget-mb 1024]
rollout: --rate 200 [--command "node scripts/gateway-rollout.mjs --no-build"] [--settle 10s]`;

async function main() {
  const [action, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  const actions = { load, soak, rollout };
  if (!actions[action]) { console.log(usage); process.exitCode = action ? 1 : 0; return; }
  const result = await actions[action](options);
  console.log(JSON.stringify(result, null, 2));
  if (result.pass === false || result.verdict?.pass === false) process.exitCode = 1;
}

if (!isMainThread) {
  worker(workerData).catch((error) => { console.error(error); process.exit(1); });
} else if (process.argv[1] && resolve(process.argv[1]) === script) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
export { bucketOf, evaluateLoad, evaluateSoak, histogram, merge, parseDuration, parseMetrics, percentile, profiles };
