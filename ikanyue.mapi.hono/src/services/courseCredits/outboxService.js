const { invariant } = require('./domain');
const { update } = require('./teachingCommand');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_RETRY_MS = 60_000;
const DEFAULT_MAX_RETRY_MS = 3_600_000;
const DEFAULT_STALE_PROCESSING_MS = 300_000;

class CourseCreditOutboxService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.dispatcher = options.dispatcher || null;
        this.clock = options.clock || Date.now;
        this.maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
        this.baseRetryMs = positiveInteger(options.baseRetryMs, DEFAULT_BASE_RETRY_MS);
        this.maxRetryMs = positiveInteger(options.maxRetryMs, DEFAULT_MAX_RETRY_MS);
        this.staleProcessingMs = positiveInteger(options.staleProcessingMs, DEFAULT_STALE_PROCESSING_MS);
    }

    async deliverDue(options = {}) {
        invariant(this.dispatcher && typeof this.dispatcher.deliver === 'function',
            'OUTBOX_DISPATCHER_REQUIRED', 'Outbox delivery requires a notification dispatcher');
        const limit = deliveryLimit(options.limit);
        const now = new Date(this.clock()).toISOString();
        const staleBefore = new Date(Date.parse(now) - this.staleProcessingMs).toISOString();
        const events = await this.repository.list('outbox_events', {
            filter: dueFilter(now, staleBefore),
            sort: 'nextAttemptAt,created,id',
        });
        const results = [];
        for (const event of events.slice(0, limit)) {
            results.push(await this.deliverOne(event, now));
        }
        return deliverySummary(results);
    }

    async deliverOne(event, now = new Date(this.clock()).toISOString()) {
        validateOutboxEvent(event);
        await this.repository.send([update('outbox_events', event.id, {
            processingStartedAt: now,
            status: 'processing',
        })]);
        const attempt = Number(event.attempts || 0) + 1;
        try {
            await this.dispatcher.deliver({
                aggregateId: event.aggregateId,
                aggregateType: event.aggregateType,
                idempotencyKey: event.id,
                payload: event.payload,
                topic: event.topic,
            });
        } catch (error) {
            return this.recordFailure(event, attempt, now, error);
        }
        await this.repository.send([update('outbox_events', event.id, {
            attempts: attempt,
            deadLetterAt: '',
            lastErrorAt: '',
            lastErrorCode: '',
            nextAttemptAt: '',
            processingStartedAt: '',
            sentAt: now,
            status: 'sent',
        })]);
        return { eventId: event.id, status: 'sent' };
    }

    async recordFailure(event, attempt, now, error) {
        const deadLetter = attempt >= this.maxAttempts;
        const nextAttemptAt = deadLetter ? '' : this.retryAt(now, attempt);
        await this.repository.send([update('outbox_events', event.id, {
            attempts: attempt,
            deadLetterAt: deadLetter ? now : '',
            lastErrorAt: now,
            lastErrorCode: safeErrorCode(error),
            nextAttemptAt,
            processingStartedAt: '',
            status: deadLetter ? 'dead_letter' : 'failed',
        })]);
        return { eventId: event.id, nextAttemptAt, status: deadLetter ? 'dead_letter' : 'failed' };
    }

    retryAt(now, attempt) {
        const delay = Math.min(this.baseRetryMs * (2 ** Math.max(0, attempt - 1)), this.maxRetryMs);
        return new Date(Date.parse(now) + delay).toISOString();
    }

    async listDeadLetters(options = {}) {
        const page = positiveInteger(options.page, 1);
        const perPage = Math.min(positiveInteger(options.perPage, 20), 100);
        const records = await this.repository.list('outbox_events', {
            filter: 'status="dead_letter"',
            sort: '-deadLetterAt,-created,id',
        });
        const start = (page - 1) * perPage;
        return {
            items: records.slice(start, start + perPage).map(deadLetterProjection),
            page,
            perPage,
            totalItems: records.length,
            totalPages: Math.ceil(records.length / perPage),
        };
    }
}

function dueFilter(now, staleBefore) {
    return `((status="pending" || status="failed") && (nextAttemptAt="" || nextAttemptAt<="${now}"))`
        + ` || (status="processing" && processingStartedAt<="${staleBefore}")`;
}

function validateOutboxEvent(event) {
    invariant(event && typeof event.id === 'string' && event.id,
        'OUTBOX_EVENT_INVALID', 'Outbox event requires an id');
    invariant(typeof event.topic === 'string' && event.topic
        && typeof event.aggregateType === 'string' && event.aggregateType
        && typeof event.aggregateId === 'string' && event.aggregateId,
    'OUTBOX_EVENT_INVALID', 'Outbox event requires topic and aggregate identity');
    invariant(Number.isInteger(Number(event.attempts || 0)) && Number(event.attempts || 0) >= 0,
        'OUTBOX_ATTEMPTS_INVALID', 'Outbox attempts must be a non-negative integer');
}

function deliveryLimit(value) {
    const limit = value === undefined ? DEFAULT_LIMIT : Number(value);
    invariant(Number.isInteger(limit) && limit > 0 && limit <= MAX_LIMIT,
        'OUTBOX_LIMIT_INVALID', `Outbox limit must be between 1 and ${MAX_LIMIT}`);
    return limit;
}

function safeErrorCode(error) {
    const code = String(error?.code || 'DELIVERY_FAILED').toUpperCase();
    return /^[A-Z0-9_:-]{1,80}$/.test(code) ? code : 'DELIVERY_FAILED';
}

function deliverySummary(results) {
    return {
        attempted: results.length,
        deadLetter: results.filter((item) => item.status === 'dead_letter').length,
        failed: results.filter((item) => item.status === 'failed').length,
        sent: results.filter((item) => item.status === 'sent').length,
        results,
    };
}

function deadLetterProjection(event) {
    return {
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        attempts: Number(event.attempts || 0),
        created: event.created,
        deadLetterAt: event.deadLetterAt,
        id: event.id,
        lastErrorCode: event.lastErrorCode || 'DELIVERY_FAILED',
        topic: event.topic,
    };
}

function positiveInteger(value, fallback) {
    const number = Number(value === undefined || value === null || value === '' ? fallback : value);
    invariant(Number.isInteger(number) && number > 0,
        'OUTBOX_CONFIGURATION_INVALID', 'Outbox configuration values must be positive integers');
    return number;
}

module.exports = {
    CourseCreditOutboxService,
    deadLetterProjection,
    deliveryLimit,
    deliverySummary,
    dueFilter,
    safeErrorCode,
    validateOutboxEvent,
};
