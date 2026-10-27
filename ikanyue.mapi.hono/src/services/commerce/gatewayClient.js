const { invariant } = require('../courseCredits/domain');

class GatewayClient {
    constructor(env = process.env, fetcher = fetch) {
        this.base = env.PAY_GATEWAY_URL || 'http://127.0.0.1:1340';
        const url = new URL(this.base);
        invariant(url.protocol === 'https:' || (url.protocol === 'http:'
            && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)),
        'PAYMENT_TLS_REQUIRED', '支付服务需要安全连接');
        this.token = env.PAY_SERVICE_TOKEN || '';
        this.mockToken = env.PAY_MOCK_TOKEN || '';
        this.mockEnabled = ['development', 'test'].includes(env.NODE_ENV) && env.PAY_MOCK_ENABLED === 'true';
        this.fetcher = fetcher;
    }

    async request(path, method = 'GET', body, key, mock = false) {
        invariant(!mock || this.mockEnabled, 'MOCK_PAYMENT_DISABLED', '模拟支付未开启');
        const token = mock ? this.mockToken : this.token;
        invariant(token.length >= 32, 'PAYMENT_NOT_CONFIGURED', '支付服务暂未配置');
        let response;
        try {
            response = await this.fetcher(new URL(path, this.base), {
                method, signal: AbortSignal.timeout(10000), redirect: 'error',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
                    ...(key ? { 'Idempotency-Key': key } : {}) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch {
            invariant(false, 'PAYMENT_RESULT_UNKNOWN', method === 'GET' || path.includes('statement')
                ? '支付服务连接超时，请稍后刷新' : '支付结果正在确认，请稍后刷新，不要重复付款');
        }
        // Proxies may answer with HTML; treat an unreadable body as an empty error payload.
        const result = await response.json().catch(() => null);
        const messages = {
            STATEMENT_DATE_CONFLICT: '该日期已导入内容不同的账单，请保留原始账单并人工核对',
            STATEMENT_DIFFERENCE_UNRESOLVED: '账单差异仍未消除，不能标记完成',
            STATEMENT_IDENTITY_MISMATCH: '账单商户或小程序不匹配',
            SETTLEMENT_CONFLICT: '此银行流水已登记，凭证内容不一致',
            STATEMENT_NOT_GENERATED: '请选择已经出账的历史日期',
        };
        invariant(response.ok, 'PAYMENT_CHANNEL_ERROR', messages[result?.error] || '支付服务暂未完成操作，请稍后重试');
        return result;
    }

    createPayment(orderId, amount, payerId, description) {
        return this.request('/v1/payments', 'POST', { reference: orderId, amount, currency: 'CNY', payerId, description }, orderId);
    }
    refreshPayment(id) { return this.request(`/v1/payments/${encodeURIComponent(id)}/refresh`, 'POST', {}); }
    payment(id) { return this.request(`/v1/payments/${encodeURIComponent(id)}`); }
    refund(id, paymentId, amount) {
        return this.request('/v1/refunds', 'POST', { reference: id, paymentId, amount }, id);
    }
    refundStatus(id) { return this.request(`/v1/refunds/${encodeURIComponent(id)}`); }
    async mockSuccess(id) {
        await this.request(`/_test/observations/${encodeURIComponent(id)}`, 'POST', { status: 'succeeded' }, '', true);
        return this.request('/_test/poll', 'POST', {}, '', true);
    }
}

module.exports = { GatewayClient };
