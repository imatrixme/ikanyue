// Black-box contract client for a running kanyue.server:
//   BASE_URL=http://127.0.0.1:1437 node --test "kanyue.server/contract/*.test.mjs"
// COMPARE_URL adds read parity checks against a second server on the same data.
// Credentials are optional; tests needing them skip when they are absent:
//   CONTRACT_STUDENT_CELLPHONE, CONTRACT_STUDENT_PASSWORD, CONTRACT_OPS_ACCOUNT, CONTRACT_OPS_PASSWORD
// CONTRACT_OPS_TOKEN (an admin ops token) runs the admin-only stage 2 checks without an admin password.
// CONTRACT_STAGE sends X-Ca-Stage, to run the suite through one environment of kanyue.gateway.
// The suite never changes business data beyond login timestamps.

export const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:1437').replace(/\/+$/, '');
export const COMPARE_URL = (process.env.COMPARE_URL || '').replace(/\/+$/, '');

export const student = credentials('CONTRACT_STUDENT_CELLPHONE', 'CONTRACT_STUDENT_PASSWORD');
export const ops = credentials('CONTRACT_OPS_ACCOUNT', 'CONTRACT_OPS_PASSWORD');
export const OPS_TOKEN = process.env.CONTRACT_OPS_TOKEN || '';
export const STAGE_HEADERS = process.env.CONTRACT_STAGE ? { 'X-Ca-Stage': process.env.CONTRACT_STAGE } : {};

function credentials(accountKey, passwordKey) {
  const account = process.env[accountKey];
  const password = process.env[passwordKey];
  return account && password ? { account, password } : null;
}

export async function call(path, { method = 'GET', body, token, base = BASE_URL, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...STAGE_HEADERS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path}: HTTP ${response.status} non-JSON body ${text.slice(0, 120)}`);
  }
  return { status: response.status, body: json };
}

// A phone no account uses, so throttle counters never touch real users.
export function unusedCellphone() {
  return `199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

export const PRIVATE_USER_FIELDS = ['password', 'passwordHash', 'tokenKey', 'wechatId', 'wechatOpenId', 'wechatUnionId', 'wechatUserInfo', 'lastLoginIp'];
