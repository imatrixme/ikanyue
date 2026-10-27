import { readFileSync, statSync } from 'node:fs';
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { ensure } from '../domain';
import { origin, type HttpTransport } from './client';
import type { WechatCredentials } from './crypto';

function secretFile(path: string) {
  ensure(typeof path === 'string' && path.startsWith('/'), 'ABSOLUTE_CREDENTIAL_PATH_REQUIRED');
  const stat = statSync(path);
  ensure(stat.isFile() && (stat.mode & 0o077) === 0 && stat.size <= 65536, 'CREDENTIAL_FILE_PERMISSIONS');
  return readFileSync(path, 'utf8');
}
export function liveCredentials(path: string): WechatCredentials {
  const data = JSON.parse(secretFile(path));
  ensure(/^wx[a-f0-9]{16}$/.test(data.appId) && /^\d{8,10}$/.test(data.merchantId)
    && /^[A-Fa-f0-9]{16,64}$/.test(data.serial), 'WECHAT_IDENTITY_CONFIGURATION');
  const privateKey = secretFile(data.privateKeyFile);
  const key = createPrivateKey(privateKey);
  ensure(key.asymmetricKeyType === 'rsa' && (key.asymmetricKeyDetails?.modulusLength || 0) >= 2048, 'WECHAT_RSA_KEY_REQUIRED');
  const certificate = new X509Certificate(secretFile(data.certificateFile));
  ensure(certificate.checkPrivateKey(key) && certificate.serialNumber.toLowerCase() === data.serial.toLowerCase()
    && Date.parse(certificate.validFrom) <= Date.now() && Date.parse(certificate.validTo) > Date.now() + 86400000,
  'WECHAT_MERCHANT_CERTIFICATE_INVALID');
  const publicKeys: Record<string, string> = Object.create(null);
  ensure(data.publicKeyFiles && Object.keys(data.publicKeyFiles).length >= 1 && Object.keys(data.publicKeyFiles).length <= 5,
    'WECHAT_PINNED_KEYS_REQUIRED');
  for (const [serial, file] of Object.entries(data.publicKeyFiles)) {
    ensure(/^PUB_KEY_ID_[A-Za-z0-9_]+$/.test(serial) || /^[A-Fa-f0-9]{16,64}$/.test(serial), 'WECHAT_PUBLIC_KEY_ID_INVALID');
    const pem = secretFile(String(file)); const publicKey = createPublicKey(pem);
    ensure(publicKey.asymmetricKeyType === 'rsa' && (publicKey.asymmetricKeyDetails?.modulusLength || 0) >= 2048, 'WECHAT_RSA_KEY_REQUIRED');
    publicKeys[serial] = pem;
  }
  const apiV3Key = Buffer.from(secretFile(data.apiV3KeyFile).trim());
  ensure(apiV3Key.length === 32, 'WECHAT_API_V3_KEY_INVALID');
  const callback = new URL(data.notifyUrl);
  ensure(callback.protocol === 'https:' && !callback.username && !callback.password && !callback.search
    && !callback.hash && callback.pathname === '/callbacks/wechatpay', 'WECHAT_CALLBACK_URL_INVALID');
  return { appId: data.appId, merchantId: data.merchantId, serial: data.serial,
    privateKey, publicKeys, apiV3Key, notifyUrl: callback.href };
}
export function liveTransport(enabled: boolean): HttpTransport {
  ensure(enabled, 'REAL_PROVIDER_NOT_QUALIFIED', 503);
  return async (request) => {
    const url = new URL(request.url);
    ensure(url.origin === origin && request.redirect === 'error', 'WECHAT_ORIGIN_FORBIDDEN');
    return fetch(request);
  };
}
