#!/usr/bin/env node

// Local-only journey: operator books and confirms a one-to-one lesson, finishes it, settles it,
// then replays every command to prove duplicate submits neither double-book nor double-deduct.
const dotenv = require('dotenv');
const { randomUUID } = require('node:crypto');

dotenv.config({ path: process.env.KANYUE_ENV_FILE || '.env' });

async function main() {
    const baseUrl = trimSlash(process.env.LOCAL_HONO_URL || process.env.KANYUE_LOCAL_API_URL || 'http://127.0.0.1:1337');
    assertLocalUrl(baseUrl);
    const studentId = process.env.SMOKE_STUDENT_ID || 'localstudent001';
    const run = randomUUID();

    const admin = await request(baseUrl, '/ops/auth/login', {
        method: 'POST',
        body: {
            account: requiredEnv('OPS_BOOTSTRAP_ADMIN_USERNAME'),
            // Bootstrap never overwrites an existing admin, so a locally changed password wins.
            password: process.env.LOCAL_ADMIN_PASSWORD || requiredEnv('OPS_BOOTSTRAP_ADMIN_PASSWORD'),
        },
    });
    const token = admin.token;
    assert(token, 'admin login did not return a token');

    const options = await request(baseUrl, `/ops/course-bookings/students/${studentId}/options`, { token });
    const option = (Array.isArray(options) ? options : options.items || []).find((item) => item.offeringId);
    assert(option, 'local student has no bookable offering; run test init first');
    const now = Date.now();
    const range = new URLSearchParams({
        offeringId: option.offeringId, from: new Date(now).toISOString(), to: new Date(now + 30 * 86400000).toISOString(),
    });
    const { slots } = await request(baseUrl, `/ops/course-bookings/students/${studentId}/slots?${range}`, { token });
    assert(slots?.length, 'local offering has no open slots');
    const slot = slots[0];

    const before = await available(baseUrl, token, studentId);
    const bookingKey = `smoke:operator-booking:${run}`;
    const booking = { studentId, offeringId: option.offeringId, startAt: slot.startAt, endAt: slot.endAt, note: '本地代约联调', confirm: true };
    const booked = await request(baseUrl, '/ops/course-bookings/appointments', { method: 'POST', token, key: bookingKey, body: booking });
    const replayed = await request(baseUrl, '/ops/course-bookings/appointments', { method: 'POST', token, key: bookingKey, body: booking });
    assert(booked.appointmentId && replayed.appointmentId === booked.appointmentId, 'replayed booking created a different appointment');

    const detail = await request(baseUrl, `/ops/course-bookings/appointments/${booked.appointmentId}`, { token });
    assert(['confirmed', 'rescheduled'].includes(detail.status), `operator booking was not confirmed: ${detail.status}`);
    const sessionId = detail.sessionId || detail.lessonId || detail.session?.id;
    assert(sessionId, 'confirmed appointment did not materialize a lesson');
    const reserved = await available(baseUrl, token, studentId);
    assert(reserved === before - 1, `confirmation should reserve one credit (before ${before}, after ${reserved})`);

    const duplicate = await request(baseUrl, '/ops/course-bookings/appointments', {
        method: 'POST', token, key: `${bookingKey}:new`, body: booking, allowFailure: true,
    });
    assert(duplicate.failed, 'booking the same slot again with a new key should be rejected');

    // Bookable slots are always in the future and lessons only complete after they start,
    // so move this local lesson into the past instead of waiting for the clock.
    await rewindLesson(sessionId);
    await request(baseUrl, `/ops/course-operations/lessons/${sessionId}/attendance/all-present`, { method: 'POST', token, key: `${bookingKey}:attendance` });
    const teachers = await request(baseUrl, `/ops/course-credits/session-teachers?sessionId=${sessionId}`, { token });
    const lead = teachers.items?.find((item) => item.sessionId === sessionId && item.role === 'lead');
    assert(lead, 'materialized lesson has no lead teacher');
    await request(baseUrl, `/ops/course-operations/lessons/${sessionId}/teachers/${lead.id}/actual-status`, {
        method: 'POST', token, key: `${bookingKey}:teacher`, body: { actualStatus: 'confirmed' },
    });
    await request(baseUrl, `/ops/course-operations/lessons/${sessionId}/status`, {
        method: 'POST', token, key: `${bookingKey}:complete`, body: { status: 'completed', reason: '本地代约联调结课' },
    });
    const settleKey = `${bookingKey}:settle`;
    await request(baseUrl, `/ops/course-credits/sessions/${sessionId}/settle`, { method: 'POST', token, key: settleKey });
    await request(baseUrl, `/ops/course-credits/sessions/${sessionId}/settle`, { method: 'POST', token, key: settleKey });
    await request(baseUrl, `/ops/course-credits/sessions/${sessionId}/settle`, {
        method: 'POST', token, key: `${settleKey}:new`, allowFailure: true,
    });

    const after = await available(baseUrl, token, studentId);
    assert(after === before - 1, `settlement should consume exactly one credit (before ${before}, after ${after})`);
    const session = await request(baseUrl, `/ops/course-credits/sessions/${sessionId}`, { token });
    assert(session.status === 'settled' || session.settlementStatus === 'settled', `lesson was not settled: ${session.status}`);

    console.log(`local operator booking smoke passed: appointment ${booked.appointmentId}, lesson ${sessionId}, credits ${before} -> ${after}`);
}

async function rewindLesson(sessionId) {
    const pbUrl = trimSlash(requiredEnv('PB_URL'));
    assertLocalUrl(pbUrl);
    const auth = await pocketbase(pbUrl, '/api/collections/_superusers/auth-with-password', {
        method: 'POST', body: { identity: requiredEnv('PB_EMAIL'), password: requiredEnv('PB_PASSWORD') },
    });
    const startAt = new Date(Date.now() - 2 * 3600000).toISOString();
    const endAt = new Date(Date.now() - 3600000).toISOString();
    await pocketbase(pbUrl, `/api/collections/sessions/records/${sessionId}`, {
        method: 'PATCH', token: auth.token, body: { startAt, endAt },
    });
}

async function pocketbase(pbUrl, path, options) {
    const headers = { 'content-type': 'application/json' };
    if (options.token) headers.authorization = options.token;
    const response = await fetch(`${pbUrl}${path}`, { method: options.method, headers, body: JSON.stringify(options.body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(`PocketBase ${options.method} ${path} failed: ${payload.message || response.status}`);
    return payload;
}

async function available(baseUrl, token, studentId) {
    const account = await request(baseUrl, `/ops/course-credits/accounts/${studentId}`, { token });
    const value = account.availableQuantity ?? account.available ?? account.summary?.availableQuantity;
    assert(Number.isFinite(value), `credit account did not expose an available quantity: ${JSON.stringify(account).slice(0, 300)}`);
    return value;
}

async function request(baseUrl, path, options = {}) {
    const headers = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.key) headers['idempotency-key'] = options.key;
    let body;
    if (options.body !== undefined || options.method === 'POST') {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.body || {});
    }
    const response = await fetch(`${baseUrl}${path}`, { method: options.method || 'GET', headers, body });
    const payload = await response.json();
    if (!response.ok || payload.code !== 10000) {
        if (options.allowFailure) return { failed: true, message: payload.message };
        throw new Error(`${options.method || 'GET'} ${path} failed: ${payload.message || response.status}`);
    }
    return payload.data;
}

function assert(value, message) {
    if (!value) throw new Error(message);
}

function assertLocalUrl(value) {
    const url = new URL(value);
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        throw new Error(`Refusing to run destructive smoke against non-local host: ${url.hostname}`);
    }
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required for local smoke`);
    return value;
}

function trimSlash(value) {
    return value.replace(/\/+$/, '');
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
