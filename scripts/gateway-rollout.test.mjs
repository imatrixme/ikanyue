import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, rollout } from './gateway-rollout.mjs';

const describe = (step) => (step.run ? step.run.slice(6).join(' ') : `healthy ${step.healthy}`);

test('the standby serves before the gateway is recreated and stops after it is healthy', () => {
  assert.deepEqual(plan().map(describe), [
    'build gateway',
    'up -d --no-deps --no-build --force-recreate gateway-standby',
    'healthy gateway-standby',
    'up -d --no-deps --no-build --force-recreate gateway',
    'healthy gateway',
    'stop gateway-standby',
  ]);
  assert.equal(plan({ build: false })[0].run.includes('build'), false);
});

const recorder = (failing) => {
  const done = [];
  return {
    done,
    exec: (command) => { done.push(command.slice(6).join(' ')); },
    waitHealthy: async (service) => {
      done.push(`healthy ${service}`);
      if (service === failing) throw new Error(`${service} unhealthy`);
    },
    log: () => {},
  };
};

test('an unhealthy standby is stopped and the gateway is never touched', async () => {
  const steps = recorder('gateway-standby');
  await assert.rejects(rollout(plan({ build: false }), steps), /gateway was not touched/);
  assert.deepEqual(steps.done.slice(-2), ['healthy gateway-standby', 'stop gateway-standby']);
  assert.equal(steps.done.some((step) => step.endsWith('force-recreate gateway')), false);
});

test('an unhealthy gateway leaves the standby serving', async () => {
  const steps = recorder('gateway');
  await assert.rejects(rollout(plan({ build: false }), steps), /standby keeps serving/);
  assert.equal(steps.done.at(-1), 'healthy gateway');
  assert.equal(steps.done.includes('stop gateway-standby'), false);
});
