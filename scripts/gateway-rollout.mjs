#!/usr/bin/env node
// Upgrades the compose gateway without dropping traffic: the standby (OpenResty's
// `backup` upstream) serves while the gateway is recreated, then stops again.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '..');
const compose = ['docker', 'compose', '--profile', 'gateway', '--profile', 'gateway-standby'];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// plan lists the rollout steps; `onFailure` says what a failed step leaves behind.
function plan({ build = true } = {}) {
  return [
    ...(build ? [{ run: [...compose, 'build', 'gateway'] }] : []),
    { run: [...compose, 'up', '-d', '--no-deps', '--no-build', '--force-recreate', 'gateway-standby'],
      onFailure: 'standby' },
    { healthy: 'gateway-standby', onFailure: 'standby' },
    // The old gateway drains for up to 10s; new connections go to the standby meanwhile.
    { run: [...compose, 'up', '-d', '--no-deps', '--no-build', '--force-recreate', 'gateway'], onFailure: 'primary' },
    { healthy: 'gateway', onFailure: 'primary' },
    { run: [...compose, 'stop', 'gateway-standby'] },
  ];
}

const run = (command) => {
  const result = spawnSync(command[0], command.slice(1), { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command.join(' ')} exited with ${result.status ?? result.error?.message}`);
};

async function healthy(service, { timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const port = spawnSync(compose[0], [...compose.slice(1), 'port', service, '1461'], { cwd: root, encoding: 'utf8' });
    const address = port.status === 0 ? port.stdout.trim().split('\n')[0] : '';
    if (address) {
      try {
        const response = await fetch(`http://${address.replace('0.0.0.0', '127.0.0.1')}/api/health`);
        if (response.ok) return;
      } catch { /* not listening yet */ }
    }
    await pause(1000);
  }
  throw new Error(`${service} was not healthy within ${timeoutMs / 1000}s`);
}

// rollout runs the plan. A failing standby is stopped and the gateway is never
// touched; a failing gateway leaves the standby serving so traffic keeps flowing.
async function rollout(steps, { exec = run, waitHealthy = healthy, log = console.log } = {}) {
  for (const step of steps) {
    try {
      if (step.run) exec(step.run);
      else await waitHealthy(step.healthy);
    } catch (error) {
      if (step.onFailure === 'standby') {
        try { exec([...compose, 'stop', 'gateway-standby']); } catch { /* reported below */ }
        throw new Error(`${error.message}. The gateway was not touched; the standby is stopped.`);
      }
      if (step.onFailure === 'primary') {
        throw new Error(`${error.message}. The standby keeps serving; fix the gateway, then run this again.`);
      }
      throw error;
    }
  }
  log('Gateway rolled out; the standby is stopped.');
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/gateway-rollout.mjs [--no-build]\n'
      + 'Builds the gateway image, serves from gateway-standby while the gateway is recreated, then stops the standby.\n'
      + 'Upgrades with schema changes the running version cannot read need a stop-and-start instead.');
  } else {
    rollout(plan({ build: !args.includes('--no-build') })).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

export { plan, rollout };
