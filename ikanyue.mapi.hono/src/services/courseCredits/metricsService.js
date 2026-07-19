const CONFLICT_CODES = new Set(['IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT']);
const INSUFFICIENT_CODES = new Set(['CREDIT_INSUFFICIENT', 'SESSION_STUDENT_CREDIT_UNRESOLVED']);
const OUTBOX_BACKLOG_FILTER = 'status="pending" || status="failed" || status="processing"';

class CourseCreditMetrics {
    constructor(options = {}) {
        this.clock = options.clock || Date.now;
        this.commands = new Map();
        this.conflictTotal = 0;
        this.insufficientCreditTotal = 0;
        this.settlementFailureTotal = 0;
    }

    async measureCommand(commandName, command) {
        const name = normalizeCommandName(commandName);
        const startedAt = this.clock();
        try {
            const result = await command();
            this.record(name, 'success', this.clock() - startedAt);
            return result;
        } catch (error) {
            this.record(name, 'failure', this.clock() - startedAt);
            if (CONFLICT_CODES.has(error?.code)) this.conflictTotal += 1;
            if (INSUFFICIENT_CODES.has(error?.code)) this.insufficientCreditTotal += 1;
            if (isSettlementCommand(name)) this.settlementFailureTotal += 1;
            throw error;
        }
    }

    snapshot() {
        const commands = {};
        for (const name of [...this.commands.keys()].sort()) {
            commands[name] = { ...this.commands.get(name) };
        }
        return {
            commandSuccessTotal: sumCommands(commands, 'success'),
            commandFailureTotal: sumCommands(commands, 'failure'),
            conflictTotal: this.conflictTotal,
            insufficientCreditTotal: this.insufficientCreditTotal,
            settlementFailureTotal: this.settlementFailureTotal,
            commands,
        };
    }

    reset() {
        this.commands.clear();
        this.conflictTotal = 0;
        this.insufficientCreditTotal = 0;
        this.settlementFailureTotal = 0;
    }

    record(name, outcome, durationMs) {
        const current = this.commands.get(name) || {
            success: 0,
            failure: 0,
            durationMsTotal: 0,
        };
        current[outcome] += 1;
        current.durationMsTotal += Math.max(0, Number(durationMs) || 0);
        this.commands.set(name, current);
    }
}

class CourseCreditMetricsService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.metrics = options.metrics || defaultCourseCreditMetrics;
        this.clock = options.clock || Date.now;
    }

    async snapshot() {
        const [expiredBatches, outbox, reconciliation, insufficient] = await Promise.all([
            this.repository.list('credit_batches', {
                filter: 'expiredQuantity > 0',
                fields: 'expiredQuantity',
            }),
            this.repository.page('outbox_events', 1, 1, {
                filter: OUTBOX_BACKLOG_FILTER,
                sort: 'created',
                fields: 'id,created,status',
            }),
            this.repository.page('reconciliation_exceptions', 1, 1, {
                filter: 'status="open"', fields: 'id',
            }),
            this.repository.page('session_students', 1, 1, {
                filter: 'creditStatus="credit_insufficient"', fields: 'id',
            }),
        ]);
        const oldestOutbox = outbox.items?.[0];
        return {
            collectedAt: new Date(this.clock()).toISOString(),
            counters: this.metrics.snapshot(),
            gauges: {
                expiredQuantity: expiredBatches.reduce(
                    (total, batch) => total + nonNegativeNumber(batch.expiredQuantity), 0
                ),
                insufficientReservations: nonNegativeNumber(insufficient.totalItems),
                outboxBacklog: nonNegativeNumber(outbox.totalItems),
                outboxLagSeconds: lagSeconds(oldestOutbox?.created, this.clock()),
                reconciliationDrift: nonNegativeNumber(reconciliation.totalItems),
            },
        };
    }
}

function normalizeCommandName(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : 'unknown';
}

function isSettlementCommand(name) {
    return name === 'settleSession' || name === 'reverseSessionSettlement';
}

function sumCommands(commands, field) {
    return Object.values(commands).reduce((total, command) => total + command[field], 0);
}

function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function lagSeconds(created, now) {
    const timestamp = Date.parse(created || '');
    if (!Number.isFinite(timestamp)) return 0;
    return Math.max(0, Math.floor((Number(now) - timestamp) / 1000));
}

const defaultCourseCreditMetrics = new CourseCreditMetrics();

module.exports = {
    CONFLICT_CODES,
    CourseCreditMetrics,
    CourseCreditMetricsService,
    INSUFFICIENT_CODES,
    OUTBOX_BACKLOG_FILTER,
    defaultCourseCreditMetrics,
    isSettlementCommand,
    lagSeconds,
    nonNegativeNumber,
    normalizeCommandName,
    sumCommands,
};
