#!/usr/bin/env node

const dotenv = require('dotenv');

const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_OUTBOX_LIMIT = 50;
const MAX_OUTBOX_LIMIT = 200;

async function runCourseBookingWorkers(options = {}) {
    const env = options.env || process.env;
    const fetchImpl = Object.hasOwn(options, 'fetchImpl') ? options.fetchImpl : globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        throw workerError('COURSE_BOOKING_WORKER_FETCH_REQUIRED', 'A fetch implementation is required');
    }
    const config = workerConfig(env);
    const cutoffAt = stableCutoffAt(resolveNow(options.now), config.intervalMinutes);
    const token = config.token || await login(config, fetchImpl);
    const jobs = [
        bookingJob('expire', '/ops/course-bookings/workers/expire', cutoffAt),
        bookingJob('fulfill', '/ops/course-bookings/workers/fulfill', cutoffAt),
    ];
    if (config.deliverOutbox) {
        jobs.push({ name: 'outbox', path: '/ops/course-credits/workers/outbox/deliver', body: {
            limit: config.outboxLimit,
        } });
    }

    const outcomes = await Promise.allSettled(jobs.map(async (job) => [
        job.name,
        await requestJson(config.baseUrl, job.path, {
            body: job.body,
            fetchImpl,
            headers: workerHeaders(token, job.name, cutoffAt),
            method: 'POST',
        }),
    ]));
    const results = {};
    const failures = [];
    outcomes.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') {
            results[outcome.value[0]] = outcome.value[1];
        } else {
            failures.push({ job: jobs[index].name, message: outcome.reason?.message || 'Worker request failed' });
        }
    });
    if (failures.length) {
        const error = workerError(
            'COURSE_BOOKING_WORKER_FAILED',
            `Course-booking worker failed: ${failures.map((item) => item.job).join(', ')}`
        );
        error.failures = failures;
        error.results = results;
        throw error;
    }
    return { cutoffAt, results };
}

function workerConfig(env = {}) {
    const baseUrl = normalizeBaseUrl(required(env.COURSE_BOOKING_WORKER_BASE_URL, 'COURSE_BOOKING_WORKER_BASE_URL'));
    const token = String(env.COURSE_BOOKING_WORKER_TOKEN || '').trim();
    const account = String(env.COURSE_BOOKING_WORKER_ACCOUNT || '').trim();
    const password = String(env.COURSE_BOOKING_WORKER_PASSWORD || '');
    if (!token && (!account || !password)) {
        throw workerError(
            'COURSE_BOOKING_WORKER_CREDENTIALS_REQUIRED',
            'Set a worker token or dedicated worker account credentials'
        );
    }
    return {
        account,
        baseUrl,
        deliverOutbox: parseBoolean(env.COURSE_BOOKING_WORKER_DELIVER_OUTBOX),
        intervalMinutes: positiveInteger(
            env.COURSE_BOOKING_WORKER_INTERVAL_MINUTES,
            DEFAULT_INTERVAL_MINUTES,
            'COURSE_BOOKING_WORKER_INTERVAL_MINUTES'
        ),
        outboxLimit: boundedPositiveInteger(
            env.COURSE_BOOKING_WORKER_OUTBOX_LIMIT,
            DEFAULT_OUTBOX_LIMIT,
            MAX_OUTBOX_LIMIT,
            'COURSE_BOOKING_WORKER_OUTBOX_LIMIT'
        ),
        password,
        token,
    };
}

async function login(config, fetchImpl) {
    const data = await requestJson(config.baseUrl, '/ops/auth/login', {
        body: { account: config.account, password: config.password },
        fetchImpl,
        method: 'POST',
    });
    if (!data?.token) {
        throw workerError('COURSE_BOOKING_WORKER_TOKEN_MISSING', 'Worker login did not return a token');
    }
    return data.token;
}

async function requestJson(baseUrl, path, options) {
    let response;
    try {
        response = await options.fetchImpl(`${baseUrl}${path}`, {
            method: options.method || 'GET',
            headers: { 'content-type': 'application/json', ...(options.headers || {}) },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
    } catch (error) {
        throw workerError('COURSE_BOOKING_WORKER_NETWORK_FAILED', error?.message || 'Worker network request failed');
    }
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw workerError('COURSE_BOOKING_WORKER_RESPONSE_INVALID', `${path} returned invalid JSON`);
    }
    if (!response.ok || payload?.code !== 10000) {
        throw workerError(
            'COURSE_BOOKING_WORKER_REQUEST_FAILED',
            `${path} failed: ${payload?.message || response.status || 'unknown error'}`
        );
    }
    return payload.data;
}

function bookingJob(name, path, cutoffAt) {
    return { name, path, body: { cutoffAt } };
}

function workerHeaders(token, job, cutoffAt) {
    const bucket = cutoffAt.replace(/[^0-9]/g, '');
    return {
        authorization: `Bearer ${token}`,
        'idempotency-key': `course-booking-${job}-${bucket}`,
        'x-trace-id': `course-booking-worker-${job}-${bucket}`,
    };
}

function stableCutoffAt(now, intervalMinutes) {
    const timestamp = new Date(now).getTime();
    if (!Number.isFinite(timestamp)) {
        throw workerError('COURSE_BOOKING_WORKER_TIME_INVALID', 'Worker time is invalid');
    }
    const intervalMs = intervalMinutes * 60_000;
    return new Date(Math.floor(timestamp / intervalMs) * intervalMs).toISOString();
}

function resolveNow(value) {
    return typeof value === 'function' ? value() : value === undefined ? Date.now() : value;
}

function normalizeBaseUrl(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw workerError('COURSE_BOOKING_WORKER_URL_INVALID', 'Worker base URL must use HTTP or HTTPS');
    }
    return url.toString().replace(/\/+$/, '');
}

function required(value, name) {
    const normalized = String(value || '').trim();
    if (!normalized) throw workerError('COURSE_BOOKING_WORKER_CONFIG_REQUIRED', `${name} is required`);
    return normalized;
}

function parseBoolean(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function positiveInteger(value, fallback, name) {
    const number = Number(value === undefined || value === '' ? fallback : value);
    if (!Number.isInteger(number) || number <= 0) {
        throw workerError('COURSE_BOOKING_WORKER_CONFIG_INVALID', `${name} must be a positive integer`);
    }
    return number;
}

function boundedPositiveInteger(value, fallback, maximum, name) {
    const number = positiveInteger(value, fallback, name);
    if (number > maximum) {
        throw workerError('COURSE_BOOKING_WORKER_CONFIG_INVALID', `${name} must not exceed ${maximum}`);
    }
    return number;
}

function workerError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

async function main(options = {}) {
    if (options.loadEnv !== false) {
        dotenv.config({ path: process.env.KANYUE_ENV_FILE || '.env' });
    }
    const logger = options.logger || console;
    try {
        const result = await runCourseBookingWorkers(options);
        logger.log(`course-booking workers completed at ${result.cutoffAt}`);
        return 0;
    } catch (error) {
        logger.error(`${error.code || 'COURSE_BOOKING_WORKER_FAILED'}: ${error.message}`);
        return 1;
    }
}

/* c8 ignore next 3 */
if (require.main === module) {
    main().then((exitCode) => { process.exitCode = exitCode; });
}

module.exports = {
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
};
