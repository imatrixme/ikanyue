import { createHash } from 'node:crypto';
import { ensure, GatewayError } from '../domain';
import { authorization, verifyResponse, type WechatCredentials } from './crypto';

export type HttpTransport = (request: Request) => Promise<Response>;
export const origin = 'https://api.mch.weixin.qq.com';
export class WechatApiError extends GatewayError {
  constructor(readonly channelCode: string, readonly httpStatus: number) { super('WECHAT_REQUEST_UNRESOLVED', 503); }
}
export class WechatClient {
  constructor(readonly credentials: WechatCredentials, readonly transport: HttpTransport, readonly mock = true) {}

  private async response(path: string, method: string, body?: unknown) {
    const url = new URL(path, origin);
    ensure(url.origin === origin && !url.username && !url.password && !url.hash, 'WECHAT_ORIGIN_FORBIDDEN');
    const raw = body === undefined ? '' : JSON.stringify(body);
    return this.transport(new Request(url, { method, body: method === 'GET' ? undefined : raw,
      redirect: 'error', signal: AbortSignal.timeout(10000), headers: {
        Authorization: authorization(method, url, raw, this.credentials),
        Accept: 'application/json', 'Content-Type': 'application/json',
        'User-Agent': 'kanyue.pay/0.1',
      } }));
  }
  async request<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await this.response(path, method, body);
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(await boundedBody(response, 65536));
    // Even errors are untrusted. An unsigned error must never release money.
    verifyResponse(response.headers, raw, this.credentials.publicKeys);
    if (!response.ok) {
      let code = 'UNKNOWN';
      try { const value = JSON.parse(raw).code; if (typeof value === 'string') code = value; } catch { /* Keep unknown pending. */ }
      throw new WechatApiError(code, response.status);
    }
    return (raw ? JSON.parse(raw) : {}) as T;
  }
  async bill(date: string) {
    const parsed = new Date(`${date}T00:00:00Z`);
    ensure(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date,
      'INVALID_BILL_DATE');
    const metadata = await this.request<{ hash_type: string; hash_value: string; download_url: string }>(
      `/v3/bill/tradebill?bill_date=${date}&bill_type=ALL`);
    const url = new URL(metadata.download_url);
    ensure(url.origin === origin && ['/v3/billdownload/file', '/v3/bill/downloadurl'].includes(url.pathname)
      && !url.username && !url.password && !url.hash, 'WECHAT_BILL_URL_FORBIDDEN');
    ensure(metadata.hash_type === 'SHA1' && /^[a-fA-F0-9]{40}$/.test(metadata.hash_value), 'WECHAT_BILL_HASH_UNSUPPORTED');
    const response = await this.response(url.href, 'GET');
    ensure(response.ok, 'WECHAT_BILL_UNAVAILABLE', 503);
    // WeChat bill bodies have no signature; the hash comes from verified metadata.
    const bytes = await boundedBody(response, 1024 * 1024);
    ensure(createHash('sha1').update(bytes).digest('hex') === metadata.hash_value.toLowerCase(),
      'WECHAT_BILL_HASH_MISMATCH', 502);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { date, hash: metadata.hash_value, content, mock: this.mock };
  }
}
async function boundedBody(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      ensure(length <= limit, 'WECHAT_RESPONSE_TOO_LARGE', 502);
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel(); }
}
