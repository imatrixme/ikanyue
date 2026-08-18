const { createHmac } = require('node:crypto');

const { invariant } = require('./domain');

const DEFAULT_TIMEOUT_MS = 10_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

class CourseCreditWebhookDispatcher {
    constructor(options = {}) {
        this.fetchImpl = options.fetchImpl === undefined ? globalThis.fetch : options.fetchImpl;
        this.secret = String(options.secret || '');
        this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
        this.url = validateWebhookUrl(options.url, options.nodeEnv);
        invariant(typeof this.fetchImpl === 'function',
            'OUTBOX_WEBHOOK_FETCH_REQUIRED', '通知投递需要 fetch 实现');
        invariant(this.secret.length >= 16,
            'OUTBOX_WEBHOOK_SECRET_INVALID', '通知签名密钥至少需要 16 个字符');
    }

    async deliver(message) {
        validateMessage(message);
        const timestamp = new Date().toISOString();
        const body = JSON.stringify({
            eventId: message.idempotencyKey,
            topic: message.topic,
            aggregate: { id: message.aggregateId, type: message.aggregateType },
            payload: message.payload,
            occurredAt: timestamp,
            version: 1,
        });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        let response;
        try {
            response = await this.fetchImpl(this.url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'idempotency-key': message.idempotencyKey,
                    'x-kanyue-event-id': message.idempotencyKey,
                    'x-kanyue-signature': signWebhook(body, timestamp, this.secret),
                    'x-kanyue-timestamp': timestamp,
                    'x-kanyue-topic': message.topic,
                },
                body,
                signal: controller.signal,
            });
        } catch (error) {
            throw deliveryError(
                controller.signal.aborted ? 'WEBHOOK_TIMEOUT' : 'WEBHOOK_NETWORK_FAILED',
                controller.signal.aborted ? '通知投递超时' : '通知投递网络失败',
                error
            );
        } finally {
            clearTimeout(timeout);
        }
        if (!response?.ok) {
            throw deliveryError(`WEBHOOK_HTTP_${Number(response?.status) || 0}`, '通知接收端拒绝了事件');
        }
        return { status: Number(response.status) };
    }
}

function createCourseCreditNotificationDispatcher(env = process.env, options = {}) {
    const url = String(env.COURSE_CREDIT_OUTBOX_WEBHOOK_URL || '').trim();
    const secret = String(env.COURSE_CREDIT_OUTBOX_WEBHOOK_SECRET || '');
    if (!url && !secret) return null;
    invariant(url && secret,
        'OUTBOX_WEBHOOK_CONFIG_INCOMPLETE', '通知 webhook URL 与签名密钥必须同时配置');
    return new CourseCreditWebhookDispatcher({
        fetchImpl: options.fetchImpl,
        nodeEnv: env.NODE_ENV,
        secret,
        timeoutMs: env.COURSE_CREDIT_OUTBOX_WEBHOOK_TIMEOUT_MS,
        url,
    });
}

function signWebhook(body, timestamp, secret) {
    return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

function validateWebhookUrl(value, nodeEnv) {
    let url;
    try {
        url = new URL(String(value || ''));
    } catch {
        invariant(false, 'OUTBOX_WEBHOOK_URL_INVALID', '通知 webhook URL 无效');
    }
    const isLoopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
    invariant(url.protocol === 'https:' || isLoopbackHttp,
        'OUTBOX_WEBHOOK_URL_INSECURE', '通知 webhook 必须使用 HTTPS，只有本机回环地址可用 HTTP');
    invariant(nodeEnv !== 'production' || url.protocol === 'https:',
        'OUTBOX_WEBHOOK_URL_INSECURE', '生产通知 webhook 必须使用 HTTPS');
    return url.toString();
}

function validateMessage(message) {
    invariant(message && typeof message === 'object',
        'OUTBOX_WEBHOOK_MESSAGE_INVALID', '通知事件无效');
    for (const name of ['aggregateId', 'aggregateType', 'idempotencyKey', 'topic']) {
        invariant(typeof message[name] === 'string' && message[name],
            'OUTBOX_WEBHOOK_MESSAGE_INVALID', '通知事件缺少必要标识', { field: name });
    }
}

function positiveInteger(value, fallback) {
    const number = Number(value === undefined || value === '' ? fallback : value);
    invariant(Number.isInteger(number) && number > 0,
        'OUTBOX_WEBHOOK_TIMEOUT_INVALID', '通知超时时间必须是正整数');
    return number;
}

function deliveryError(code, message, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.code = code;
    return error;
}

module.exports = {
    CourseCreditWebhookDispatcher,
    createCourseCreditNotificationDispatcher,
    deliveryError,
    positiveInteger,
    signWebhook,
    validateMessage,
    validateWebhookUrl,
};
