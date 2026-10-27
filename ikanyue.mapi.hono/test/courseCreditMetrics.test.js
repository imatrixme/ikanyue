const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditMetrics,
    CourseCreditMetricsService,
    lagSeconds,
    nonNegativeNumber,
    normalizeCommandName,
    sumCommands,
} = require('../src/services/courseCredits/metricsService');

test('command metrics record success, conflicts, insufficiency, and settlement failures', async () => {
    const times = [100, 112, 200, 230, 300, 350, 400, 470];
    const metrics = new CourseCreditMetrics({ clock: () => times.shift() });

    assert.deepEqual(await metrics.measureCommand('grantOrderCredits', async () => ({ ok: true })), { ok: true });
    await assert.rejects(metrics.measureCommand('reserveSessionCredit', async () => {
        throw Object.assign(new Error('conflict'), { code: 'VERSION_CONFLICT' });
    }));
    await assert.rejects(metrics.measureCommand('reserveSessionCredit', async () => {
        throw Object.assign(new Error('insufficient'), { code: 'CREDIT_INSUFFICIENT' });
    }));
    await assert.rejects(metrics.measureCommand('settleSession', async () => {
        throw new Error('storage failure');
    }));

    assert.deepEqual(metrics.snapshot(), {
        commandSuccessTotal: 1,
        commandFailureTotal: 3,
        conflictTotal: 1,
        insufficientCreditTotal: 1,
        settlementFailureTotal: 1,
        commands: {
            grantOrderCredits: { success: 1, failure: 0, durationMsTotal: 12 },
            reserveSessionCredit: { success: 0, failure: 2, durationMsTotal: 80 },
            settleSession: { success: 0, failure: 1, durationMsTotal: 70 },
        },
    });
    metrics.reset();
    assert.equal(metrics.snapshot().commandSuccessTotal, 0);
});

test('metrics snapshot combines runtime counters with durable operational gauges', async () => {
    const calls = [];
    const repository = {
        async list(collection, options) {
            calls.push(['list', collection, options]);
            return [{ expiredQuantity: 3 }, { expiredQuantity: '2' }, { expiredQuantity: -1 }];
        },
        async page(collection, page, perPage, options) {
            calls.push(['page', collection, page, perPage, options]);
            if (collection === 'outbox_events') {
                return { totalItems: 4, items: [{ created: '2026-07-17T09:59:00.000Z' }] };
            }
            if (collection === 'reconciliation_exceptions') return { totalItems: 2, items: [] };
            return { totalItems: 5, items: [] };
        },
    };
    const metrics = new CourseCreditMetrics();
    const service = new CourseCreditMetricsService(repository, {
        metrics,
        clock: () => Date.parse('2026-07-17T10:00:00.000Z'),
    });

    const snapshot = await service.snapshot();

    assert.equal(snapshot.collectedAt, '2026-07-17T10:00:00.000Z');
    assert.deepEqual(snapshot.gauges, {
        expiredQuantity: 5,
        insufficientReservations: 5,
        outboxBacklog: 4,
        outboxLagSeconds: 60,
        reconciliationDrift: 2,
    });
    assert.equal(calls.length, 4);
    assert.equal(calls[1][2], 1);
    assert.equal(calls[1][3], 1);
});

test('metrics helpers normalize invalid names, values, and timestamps', () => {
    assert.equal(normalizeCommandName('  convertCredits  '), 'convertCredits');
    assert.equal(normalizeCommandName(''), 'unknown');
    assert.equal(normalizeCommandName(null), 'unknown');
    assert.equal(nonNegativeNumber('4'), 4);
    assert.equal(nonNegativeNumber(-1), 0);
    assert.equal(nonNegativeNumber('invalid'), 0);
    assert.equal(lagSeconds('', 100), 0);
    assert.equal(lagSeconds('2026-07-17T10:01:00Z', Date.parse('2026-07-17T10:00:00Z')), 0);
    assert.equal(sumCommands({ one: { success: 2 }, two: { success: 3 } }, 'success'), 5);
});
