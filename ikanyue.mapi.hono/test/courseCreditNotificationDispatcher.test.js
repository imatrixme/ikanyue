const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditWebhookDispatcher,
    createCourseCreditNotificationDispatcher,
    deliveryError,
    positiveInteger,
    signWebhook,
    validateMessage,
    validateWebhookUrl,
} = require('../src/services/courseCredits/notificationDispatcher');

const SECRET = 'notification-secret-1234';

test('signed webhook delivery preserves idempotency and event identity', async () => {
    const calls = [];
    const dispatcher = new CourseCreditWebhookDispatcher({
        fetchImpl: async (...args) => {
            calls.push(args);
            return { ok: true, status: 202 };
        },
        secret: SECRET,
        url: 'http://127.0.0.1:39000/events',
    });
    const result = await dispatcher.deliver(message());
    const [url, request] = calls[0];
    const payload = JSON.parse(request.body);

    assert.deepEqual(result, { status: 202 });
    assert.equal(url, 'http://127.0.0.1:39000/events');
    assert.equal(request.headers['idempotency-key'], 'event-1');
    assert.equal(request.headers['x-kanyue-event-id'], 'event-1');
    assert.equal(request.headers['x-kanyue-topic'], 'course-credit.order-granted');
    assert.equal(request.headers['x-kanyue-signature'], signWebhook(
        request.body, request.headers['x-kanyue-timestamp'], SECRET
    ));
    assert.deepEqual(payload.aggregate, { id: 'order-1', type: 'order' });
    assert.deepEqual(payload.payload, { operationId: 'operation-1' });
    assert.equal(payload.version, 1);
});

test('dispatcher reports provider, network, and timeout failures with safe codes', async () => {
    await assert.rejects(dispatcher(async () => ({ ok: false, status: 429 })).deliver(message()),
        hasCode('WEBHOOK_HTTP_429'));
    await assert.rejects(dispatcher(async () => ({ ok: false })).deliver(message()),
        hasCode('WEBHOOK_HTTP_0'));
    await assert.rejects(dispatcher(async () => { throw new Error('private network detail'); }).deliver(message()),
        hasCode('WEBHOOK_NETWORK_FAILED'));
    await assert.rejects(new CourseCreditWebhookDispatcher({
        fetchImpl: async (_url, request) => new Promise((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
        secret: SECRET,
        timeoutMs: 1,
        url: 'http://localhost:39000/events',
    }).deliver(message()), hasCode('WEBHOOK_TIMEOUT'));
});

test('environment factory is optional but rejects partial or unsafe production configuration', () => {
    assert.equal(createCourseCreditNotificationDispatcher({}), null);
    assert.throws(() => createCourseCreditNotificationDispatcher({
        COURSE_CREDIT_OUTBOX_WEBHOOK_URL: 'https://notify.example.com/events',
    }), hasCode('OUTBOX_WEBHOOK_CONFIG_INCOMPLETE'));
    assert.throws(() => createCourseCreditNotificationDispatcher({
        COURSE_CREDIT_OUTBOX_WEBHOOK_SECRET: SECRET,
    }), hasCode('OUTBOX_WEBHOOK_CONFIG_INCOMPLETE'));
    assert.throws(() => createCourseCreditNotificationDispatcher({
        NODE_ENV: 'production',
        COURSE_CREDIT_OUTBOX_WEBHOOK_URL: 'http://127.0.0.1/events',
        COURSE_CREDIT_OUTBOX_WEBHOOK_SECRET: SECRET,
    }), hasCode('OUTBOX_WEBHOOK_URL_INSECURE'));
    const configured = createCourseCreditNotificationDispatcher({
        NODE_ENV: 'production',
        COURSE_CREDIT_OUTBOX_WEBHOOK_URL: 'https://notify.example.com/events',
        COURSE_CREDIT_OUTBOX_WEBHOOK_SECRET: SECRET,
        COURSE_CREDIT_OUTBOX_WEBHOOK_TIMEOUT_MS: '2500',
    }, { fetchImpl: async () => ({ ok: true, status: 204 }) });
    assert.equal(configured.timeoutMs, 2500);
    const defaultFetch = createCourseCreditNotificationDispatcher({
        COURSE_CREDIT_OUTBOX_WEBHOOK_URL: 'http://127.0.0.1:39000/events',
        COURSE_CREDIT_OUTBOX_WEBHOOK_SECRET: SECRET,
    });
    assert.equal(defaultFetch.fetchImpl, globalThis.fetch);
});

test('dispatcher validates configuration and message contracts', () => {
    assert.equal(validateWebhookUrl('https://notify.example.com/events', 'production'),
        'https://notify.example.com/events');
    assert.throws(() => validateWebhookUrl('not a url'), hasCode('OUTBOX_WEBHOOK_URL_INVALID'));
    assert.throws(() => validateWebhookUrl('http://notify.example.com/events'),
        hasCode('OUTBOX_WEBHOOK_URL_INSECURE'));
    assert.throws(() => new CourseCreditWebhookDispatcher({
        fetchImpl: null, secret: SECRET, url: 'https://notify.example.com/events',
    }), hasCode('OUTBOX_WEBHOOK_FETCH_REQUIRED'));
    assert.throws(() => dispatcher(async () => ({ ok: true, status: 200 }), 'short'),
        hasCode('OUTBOX_WEBHOOK_SECRET_INVALID'));
    assert.throws(() => positiveInteger(0, 10), hasCode('OUTBOX_WEBHOOK_TIMEOUT_INVALID'));
    assert.equal(positiveInteger(undefined, 10), 10);
    assert.throws(() => validateMessage(null), hasCode('OUTBOX_WEBHOOK_MESSAGE_INVALID'));
    assert.throws(() => validateMessage({ ...message(), topic: '' }),
        hasCode('OUTBOX_WEBHOOK_MESSAGE_INVALID'));
    assert.equal(deliveryError('TEST', 'failed').code, 'TEST');
});

function dispatcher(fetchImpl, secret = SECRET) {
    return new CourseCreditWebhookDispatcher({
        fetchImpl, secret, url: 'http://[::1]:39000/events',
    });
}

function message() {
    return {
        aggregateId: 'order-1',
        aggregateType: 'order',
        idempotencyKey: 'event-1',
        payload: { operationId: 'operation-1' },
        topic: 'course-credit.order-granted',
    };
}

function hasCode(code) {
    return (error) => error.code === code;
}
