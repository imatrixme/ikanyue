import { createDecipheriv, randomBytes, sign, verify } from 'node:crypto';
import { ensure } from '../domain';

export interface WechatCredentials {
  appId: string; merchantId: string; serial: string; privateKey: string;
  publicKeys: Record<string, string>; apiV3Key: Buffer; notifyUrl: string;
}
export const seconds = () => Math.floor(Date.now() / 1000);
export const nonce = () => randomBytes(16).toString('hex');
export function rsaSign(message: string, key: string) {
  return sign('RSA-SHA256', Buffer.from(message), key).toString('base64');
}
export function verifyMessage(message: string, signature: string, key: string) {
  ensure(/^[A-Za-z0-9+/]+={0,2}$/.test(signature)
    && verify('RSA-SHA256', Buffer.from(message), key, Buffer.from(signature, 'base64')),
  'WECHAT_SIGNATURE_INVALID', 401);
}
export function authorization(method: string, url: URL, body: string, credentials: WechatCredentials) {
  const timestamp = seconds().toString(); const random = nonce();
  const signature = rsaSign(`${method}\n${url.pathname}${url.search}\n${timestamp}\n${random}\n${body}\n`, credentials.privateKey);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${credentials.merchantId}",nonce_str="${random}",timestamp="${timestamp}",serial_no="${credentials.serial}",signature="${signature}"`;
}
export function verifyResponse(headers: Headers, body: string, keys: Record<string, string>, now = seconds()) {
  const serial = headers.get('Wechatpay-Serial') || '';
  const key = Object.hasOwn(keys, serial) ? keys[serial] : undefined;
  ensure(key, 'WECHAT_UNKNOWN_SIGNING_KEY', 401);
  const timestamp = headers.get('Wechatpay-Timestamp') || '';
  const random = headers.get('Wechatpay-Nonce') || '';
  ensure(/^\d{10}$/.test(timestamp) && Math.abs(now - Number(timestamp)) <= 300,
    'WECHAT_STALE_SIGNATURE', 401);
  ensure(random.length > 0 && random.length <= 128 && !/[\r\n]/.test(random), 'WECHAT_INVALID_NONCE', 401);
  verifyMessage(`${timestamp}\n${random}\n${body}\n`, headers.get('Wechatpay-Signature') || '', key);
}
export function launchParameters(prepayId: string, credentials: WechatCredentials) {
  ensure(/^\w{1,64}$/.test(prepayId), 'WECHAT_INVALID_PREPAY_ID', 502);
  const timeStamp = seconds().toString(); const nonceStr = nonce();
  const packageValue = `prepay_id=${prepayId}`;
  return { appId: credentials.appId, timeStamp, nonceStr, package: packageValue, signType: 'RSA' as const,
    paySign: rsaSign(`${credentials.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`, credentials.privateKey) };
}
export function decodeNotification(headers: Headers, raw: string, credentials: WechatCredentials) {
  verifyResponse(headers, raw, credentials.publicKeys);
  const envelope = JSON.parse(raw);
  const resource = envelope.resource;
  ensure(envelope.resource_type === 'encrypt-resource' && typeof envelope.id === 'string'
    && resource?.algorithm === 'AEAD_AES_256_GCM', 'WECHAT_INVALID_NOTIFICATION');
  ensure(credentials.apiV3Key.length === 32 && typeof resource.nonce === 'string'
    && Buffer.byteLength(resource.nonce) === 12 && typeof resource.ciphertext === 'string'
    && (resource.associated_data === undefined || typeof resource.associated_data === 'string'), 'WECHAT_INVALID_RESOURCE');
  const ciphertext = Buffer.from(resource.ciphertext, 'base64');
  ensure(ciphertext.length > 16, 'WECHAT_INVALID_CIPHERTEXT');
  try {
    const cipher = createDecipheriv('aes-256-gcm', credentials.apiV3Key, Buffer.from(resource.nonce));
    cipher.setAAD(Buffer.from(resource.associated_data || ''));
    cipher.setAuthTag(ciphertext.subarray(-16));
    const plaintext = Buffer.concat([cipher.update(ciphertext.subarray(0, -16)), cipher.final()]).toString('utf8');
    return { id: envelope.id as string, type: envelope.event_type as string, data: JSON.parse(plaintext) };
  } catch { throw new Error('WECHAT_NOTIFICATION_DECRYPTION_FAILED'); }
}
