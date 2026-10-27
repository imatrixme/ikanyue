import { createHash, timingSafeEqual } from 'node:crypto';

export class GatewayError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export class Conflict extends GatewayError {
  constructor() { super('CONCURRENT_CHANGE', 409); }
}
export function ensure(value: unknown, code: string, status = 400): asserts value {
  if (!value) throw new GatewayError(code, status);
}
export function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function recordId(...parts: unknown[]) { return digest(parts).slice(0, 15); }
export function text(value: unknown, field: string) {
  ensure(typeof value === 'string' && /^[a-zA-Z0-9_.:@-]{1,120}$/.test(value), `INVALID_${field}`);
  return value;
}
export function minorUnits(value: unknown) {
  ensure(typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 100_000_000,
    'INVALID_AMOUNT');
  return value;
}
export function equalSecret(actual: string, expected: string) {
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function retry<T>(action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await action(); }
    catch (error) { if (!(error instanceof Conflict) || attempt >= 5) throw error; }
  }
}
