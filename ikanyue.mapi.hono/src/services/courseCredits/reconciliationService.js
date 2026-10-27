const { createRecordId, invariant, reconstructBatch } = require('./domain');
const { create, escapeFilter } = require('./teachingCommand');
const { filterTime } = require('./repositories/operationRepository');

class CourseCreditReconciliationService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async run(input = {}) {
        const scope = validateScope(input.scope);
        const since = scope === 'incremental' ? validateSince(input.since) : '';
        const startedAt = new Date(this.clock()).toISOString();
        const batches = await this.loadBatches(scope, since);
        const reports = [];
        for (const batch of batches) {
            const batchId = escapeFilter(batch.id);
            const [events, allocations] = await Promise.all([
                this.repository.list('credit_events', {
                    filter: `batchId="${batchId}"`,
                    sort: 'businessTime,created,id',
                }),
                this.repository.list('session_credit_allocations', {
                    filter: `batchId="${batchId}"`,
                    sort: 'created,id',
                }),
            ]);
            reports.push(reconstructBatch(batch, events, allocations));
        }

        const runId = this.idFactory();
        const differences = reports.flatMap((report) => report.differences.map((item) => ({
            ...item,
            batchId: report.batchId,
        })));
        const finishedAt = new Date(this.clock()).toISOString();
        const result = {
            batchCount: batches.length,
            differenceCount: differences.length,
            runId,
            scope,
            since,
            status: differences.length === 0 ? 'passed' : 'failed',
        };
        const plan = [
            create('reconciliation_runs', {
                id: runId,
                scope,
                status: result.status,
                startedAt,
                finishedAt,
                differenceCount: differences.length,
                report: {
                    batchCount: batches.length,
                    differenceBatchIds: [...new Set(differences.map((item) => item.batchId))],
                    since,
                },
            }),
            ...differences.map((item) => create('reconciliation_exceptions', exceptionRecord(
                this.idFactory(), runId, finishedAt, item
            ))),
        ];
        await this.repository.send(plan);
        return result;
    }

    async loadBatches(scope, since) {
        if (scope === 'full') {
            return this.repository.list('credit_batches', { sort: 'id' });
        }
        const [batches, events] = await Promise.all([
            this.repository.list('credit_batches', {
                filter: `updated>="${escapeFilter(filterTime(since))}"`,
                sort: 'id',
            }),
            this.repository.list('credit_events', {
                filter: `created>="${escapeFilter(filterTime(since))}"`,
                sort: 'batchId,id',
            }),
        ]);
        const byId = new Map(batches.map((batch) => [batch.id, batch]));
        for (const batchId of new Set(events.map((event) => event.batchId).filter(Boolean))) {
            if (!byId.has(batchId)) byId.set(batchId, await this.repository.get('credit_batches', batchId));
        }
        return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
    }
}

function exceptionRecord(id, runId, detectedAt, difference) {
    const record = {
        id,
        runId,
        batchId: difference.batchId,
        code: difference.code,
        field: difference.field,
        details: { actual: difference.actual, expected: difference.expected },
        status: 'open',
        detectedAt,
    };
    if (Number.isFinite(difference.expected)) record.expectedValue = difference.expected;
    if (Number.isFinite(difference.actual)) record.actualValue = difference.actual;
    return record;
}

function validateScope(scope) {
    invariant(['full', 'incremental'].includes(scope),
        'RECONCILIATION_SCOPE_INVALID', 'Reconciliation scope must be full or incremental');
    return scope;
}

function validateSince(value) {
    const timestamp = Date.parse(value || '');
    invariant(Number.isFinite(timestamp),
        'RECONCILIATION_SINCE_REQUIRED', 'Incremental reconciliation requires a valid since timestamp');
    return new Date(timestamp).toISOString();
}

module.exports = {
    CourseCreditReconciliationService,
    exceptionRecord,
    validateScope,
    validateSince,
};
