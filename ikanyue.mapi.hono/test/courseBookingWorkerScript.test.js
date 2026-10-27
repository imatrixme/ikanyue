const test = require('node:test');
const assert = require('node:assert/strict');

const {
    boundedPositiveInteger,
    main,
    normalizeBaseUrl,
    parseBoolean,
    positiveInteger,
    requestJson,
    runCourseBookingWorkers,
    stableCutoffAt,
    workerConfig,
    workerHeaders,
} = require('../scripts/course-booking-worker');

test('worker script invokes expiry, fulfillment, and optional outbox with stable metadata', async () => {
    const calls = [];
    const result = await runCourseBookingWorkers({
        env: workerEnv({
            COURSE_BOOKING_WORKER_DELIVER_OUTBOX: 'true',
            COURSE_BOOKING_WORKER_OUTBOX_LIMIT: '25',
            COURSE_BOOKING_WORKER_TOKEN: 'worker-token',
        }),
        fetchImpl: successfulFetch(calls),
        now: '2030-08-20T12:07:42.000Z',
    });

    assert.equal(result.cutoffAt, '2030-08-20T12:05:00.000Z');
    assert.deepEqual(Object.keys(result.results), ['expire', 'fulfill', 'outbox']);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, 'https://api.example.com/ops/course-bookings/workers/expire');
    assert.deepEqual(calls[0].body, { cutoffAt: result.cutoffAt });
    assert.equal(calls[0].headers.authorization, 'Bearer worker-token');
    assert.match(calls[0].headers['idempotency-key'], /^course-booking-expire-/);
    assert.deepEqual(calls[2].body, { limit: 25 });
});

test('worker script authenticates a dedicated operator when no token is configured', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url, body, headers: options.headers });
        if (url.endsWith('/ops/auth/login')) {
            return response({ code: 10000, data: { token: 'login-token' } });
        }
        return response({ code: 10000, data: { processedCount: 0 } });
    };
    await runCourseBookingWorkers({
        env: workerEnv(),
        fetchImpl,
        now: Date.parse('2030-08-20T12:00:00.000Z'),
    });

    assert.deepEqual(calls[0].body, { account: 'booking-worker', password: 'worker-secret' });
    assert.equal(calls[1].headers.authorization, 'Bearer login-token');
    assert.equal(calls.length, 3);
});

test('worker script reports partial failures after all booking jobs were attempted', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        if (url.endsWith('/expire')) {
            return response({ code: 400, message: 'expiry unavailable', data: null });
        }
        return response({ code: 10000, data: { processedCount: 1 } });
    };
    await assert.rejects(
        runCourseBookingWorkers({
            env: workerEnv({ COURSE_BOOKING_WORKER_TOKEN: 'token' }),
            fetchImpl,
            now: '2030-08-20T12:00:00.000Z',
        }),
        (error) => error.code === 'COURSE_BOOKING_WORKER_FAILED'
            && error.failures[0].job === 'expire'
            && error.results.fulfill.processedCount === 1
    );
    assert.equal(calls.length, 2);
});

test('worker configuration validates credentials, URLs, limits, booleans, and time buckets', () => {
    assert.equal(parseBoolean('YES'), true);
    assert.equal(parseBoolean('false'), false);
    assert.equal(positiveInteger('', 5, 'INTERVAL'), 5);
    assert.equal(boundedPositiveInteger('200', 50, 200, 'LIMIT'), 200);
    assert.equal(normalizeBaseUrl('https://api.example.com///'), 'https://api.example.com');
    assert.match(workerHeaders('token', 'expire', '2030-08-20T12:00:00.000Z')['x-trace-id'], /expire/);
    assert.equal(stableCutoffAt('2030-08-20T12:04:59.000Z', 5), '2030-08-20T12:00:00.000Z');
    assert.throws(() => workerConfig({}), hasCode('COURSE_BOOKING_WORKER_CONFIG_REQUIRED'));
    assert.throws(() => workerConfig(workerEnv({ COURSE_BOOKING_WORKER_ACCOUNT: '', COURSE_BOOKING_WORKER_PASSWORD: '' })), hasCode('COURSE_BOOKING_WORKER_CREDENTIALS_REQUIRED'));
    assert.throws(() => workerConfig(workerEnv({ COURSE_BOOKING_WORKER_INTERVAL_MINUTES: '0' })), hasCode('COURSE_BOOKING_WORKER_CONFIG_INVALID'));
    assert.throws(() => workerConfig(workerEnv({ COURSE_BOOKING_WORKER_OUTBOX_LIMIT: '201' })), hasCode('COURSE_BOOKING_WORKER_CONFIG_INVALID'));
    assert.throws(() => normalizeBaseUrl('ftp://api.example.com'), hasCode('COURSE_BOOKING_WORKER_URL_INVALID'));
    assert.throws(() => stableCutoffAt('invalid', 5), hasCode('COURSE_BOOKING_WORKER_TIME_INVALID'));
});

test('worker requests classify network, JSON, HTTP, and missing-token failures', async () => {
    await assert.rejects(requestJson('https://api.example.com', '/worker', {
        fetchImpl: async () => { throw new Error('offline'); },
    }), hasCode('COURSE_BOOKING_WORKER_NETWORK_FAILED'));
    await assert.rejects(requestJson('https://api.example.com', '/worker', {
        fetchImpl: async () => ({ ok: true, async json() { throw new Error('bad json'); } }),
    }), hasCode('COURSE_BOOKING_WORKER_RESPONSE_INVALID'));
    await assert.rejects(requestJson('https://api.example.com', '/worker', {
        fetchImpl: async () => response({ code: 500, data: null }, false, 503),
    }), hasCode('COURSE_BOOKING_WORKER_REQUEST_FAILED'));
    await assert.rejects(runCourseBookingWorkers({
        env: workerEnv(),
        fetchImpl: async () => response({ code: 10000, data: {} }),
    }), hasCode('COURSE_BOOKING_WORKER_TOKEN_MISSING'));
    await assert.rejects(runCourseBookingWorkers({
        env: workerEnv({ COURSE_BOOKING_WORKER_TOKEN: 'token' }),
        fetchImpl: null,
    }), hasCode('COURSE_BOOKING_WORKER_FETCH_REQUIRED'));
});

test('worker main reports a concise success or failure exit code', async () => {
    const messages = [];
    const logger = { log: (message) => messages.push(message), error: (message) => messages.push(message) };
    assert.equal(await main({
        env: workerEnv({ COURSE_BOOKING_WORKER_TOKEN: 'token' }),
        fetchImpl: successfulFetch([]),
        loadEnv: false,
        logger,
        now: '2030-08-20T12:00:00.000Z',
    }), 0);
    assert.equal(await main({ env: {}, fetchImpl: successfulFetch([]), loadEnv: false, logger }), 1);
    assert.match(messages[0], /completed/);
    assert.match(messages[1], /CONFIG_REQUIRED/);
});

test('worker defaults to process environment, global fetch, function clocks, and console logging', async () => {
    const names = [
        'COURSE_BOOKING_WORKER_ACCOUNT',
        'COURSE_BOOKING_WORKER_BASE_URL',
        'COURSE_BOOKING_WORKER_INTERVAL_MINUTES',
        'COURSE_BOOKING_WORKER_PASSWORD',
        'COURSE_BOOKING_WORKER_TOKEN',
    ];
    const previousEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const previousFetch = globalThis.fetch;
    const previousLog = console.log;
    const calls = [];
    const messages = [];
    Object.assign(process.env, workerEnv({ COURSE_BOOKING_WORKER_TOKEN: 'process-token' }));
    globalThis.fetch = successfulFetch(calls);
    console.log = (message) => messages.push(message);
    try {
        const result = await runCourseBookingWorkers({ now: () => '2030-08-20T12:03:00.000Z' });
        assert.equal(result.cutoffAt, '2030-08-20T12:00:00.000Z');
        assert.equal(await main({ now: '2030-08-20T12:03:00.000Z' }), 0);
        assert.equal(calls.length, 4);
        assert.match(messages[0], /completed/);
    } finally {
        globalThis.fetch = previousFetch;
        console.log = previousLog;
        names.forEach((name) => {
            if (previousEnv[name] === undefined) delete process.env[name];
            else process.env[name] = previousEnv[name];
        });
    }
});

test('worker error fallbacks remain useful when dependencies omit messages and codes', async () => {
    await assert.rejects(requestJson('https://api.example.com', '/worker', {
        fetchImpl: async () => { throw null; },
    }), (error) => error.code === 'COURSE_BOOKING_WORKER_NETWORK_FAILED'
        && /network request failed/i.test(error.message));
    await assert.rejects(requestJson('https://api.example.com', '/worker', {
        fetchImpl: async () => response({ code: 500, data: null }, false, null),
    }), (error) => error.code === 'COURSE_BOOKING_WORKER_REQUEST_FAILED'
        && /unknown error/.test(error.message));
    const messages = [];
    assert.equal(await main({
        env: workerEnv({
            COURSE_BOOKING_WORKER_BASE_URL: { toString() { throw new Error('config coercion failed'); } },
            COURSE_BOOKING_WORKER_TOKEN: 'token',
        }),
        fetchImpl: successfulFetch([]),
        loadEnv: false,
        logger: { log() {}, error: (message) => messages.push(message) },
    }), 1);
    assert.match(messages[0], /^COURSE_BOOKING_WORKER_FAILED:/);
});

function workerEnv(changes = {}) {
    return {
        COURSE_BOOKING_WORKER_ACCOUNT: 'booking-worker',
        COURSE_BOOKING_WORKER_BASE_URL: 'https://api.example.com/',
        COURSE_BOOKING_WORKER_INTERVAL_MINUTES: '5',
        COURSE_BOOKING_WORKER_PASSWORD: 'worker-secret',
        ...changes,
    };
}

function successfulFetch(calls) {
    return async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
        return response({ code: 10000, data: { processedCount: 0 } });
    };
}

function response(payload, ok = true, status = 200) {
    return { ok, status, async json() { return payload; } };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
