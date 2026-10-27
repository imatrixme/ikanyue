import { ensure } from './domain';

export function config(env: Record<string, string | undefined> = process.env) {
  const mode = env.NODE_ENV || 'development';
  const provider = env.PAY_PROVIDER || 'mock';
  ensure(['development', 'test', 'production'].includes(mode), 'INVALID_ENVIRONMENT');
  ensure(!(mode === 'production' && ['mock', 'wechatpay-mock'].includes(provider)), 'MOCK_FORBIDDEN_IN_PRODUCTION');
  const live = provider === 'wechatpay' && mode === 'production' && env.PAY_LIVE_ENABLED === 'true'
    && env.PAY_RELEASE_APPROVAL === 'merchant-live-acceptance-approved';
  ensure(['mock', 'wechatpay-mock'].includes(provider) || live, 'REAL_PROVIDER_NOT_QUALIFIED', 503);
  const token = env.PAY_SERVICE_TOKEN || '';
  const mockToken = env.PAY_MOCK_TOKEN || '';
  ensure(token.length >= 32 && (live ? !mockToken : mockToken.length >= 32 && token !== mockToken), 'INVALID_SERVICE_SECRETS');
  const credentialFile = env.PAY_WECHAT_CREDENTIALS_FILE || '';
  if (live) ensure(credentialFile.startsWith('/'), 'WECHAT_CREDENTIALS_REQUIRED');
  let events: { url: string; token: string } | null = null;
  if (env.PAY_EVENT_URL) {
    const url = new URL(env.PAY_EVENT_URL); const eventToken = env.PAY_EVENT_TOKEN || '';
    ensure(!url.username && !url.password && !url.hash && (url.protocol === 'https:'
      || (mode !== 'production' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))), 'EVENT_URL_FORBIDDEN');
    ensure(eventToken.length >= 32 && eventToken !== token && eventToken !== mockToken, 'INVALID_EVENT_SECRET');
    events = { url: url.href, token: eventToken };
  }
  const owner = env.PAY_CLIENT_ID || 'kanyue';
  ensure(/^[a-zA-Z0-9_-]{1,64}$/.test(owner), 'INVALID_CLIENT_ID');
  const pbUrl = env.PAY_PB_URL || 'http://127.0.0.1:18092';
  const url = new URL(pbUrl);
  ensure(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)), 'PB_TLS_REQUIRED');
  const port = Number(env.PAY_PORT || 1340);
  const interval = Number(env.PAY_WORKER_INTERVAL_MS || 2000);
  ensure(Number.isInteger(port) && port > 0 && port < 65536, 'INVALID_PORT');
  ensure(Number.isInteger(interval) && interval >= 100 && interval <= 60000, 'INVALID_WORKER_INTERVAL');
  return { mode, provider, live, credentialFile, events, token, mockToken, owner, pbUrl, port, interval,
    host: env.PAY_HOST || '127.0.0.1', email: env.PAY_PB_EMAIL || '', password: env.PAY_PB_PASSWORD || '' };
}
