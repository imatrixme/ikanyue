import { ensure } from '../domain';

export interface TradeLine { kind: 'payment' | 'refund'; targetId: string; paymentId: string; receiptId: string;
  amount: number; fees: number; status: string; occurredAt: string; settlementBasis: number }
export function decimalMinor(value: string, signed = false) {
  ensure((signed ? /^-?\d{1,10}\.\d{2}$/ : /^\d{1,10}\.\d{2}$/).test(value), 'STATEMENT_AMOUNT_INVALID');
  const negative = value.startsWith('-'); const [whole, fraction] = value.replace(/^-/, '').split('.');
  const amount = Number(whole) * 100 + Number(fraction);
  ensure(Number.isSafeInteger(amount), 'STATEMENT_AMOUNT_INVALID');
  return negative ? -amount : amount;
}
export function parseTradeBill(content: string, date: string, merchantId: string, appId: string): TradeLine[] {
  ensure(Buffer.byteLength(content) <= 1024 * 1024 && validDate(date), 'STATEMENT_TOO_LARGE_OR_INVALID_DATE');
  // API bills are delimiter-separated, NOT RFC CSV: WeChat escapes embedded commas to backslash-space.
  const rows = content.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map((line) => line.split(',').map((cell) => cell.replace(/^`/, '')));
  const headers = rows.shift() || [];
  const required = ['交易时间', '公众账号ID', '商户号', '微信订单号', '商户订单号', '交易状态', '货币种类',
    '应结订单金额', '微信退款单号', '商户退款单号', '退款金额', '退款状态', '手续费', '订单金额', '申请退款金额'];
  ensure(required.every((name) => headers.includes(name)) && new Set(headers).size === headers.length, 'STATEMENT_ALL_FORMAT_REQUIRED');
  const result: TradeLine[] = []; const seen = new Set<string>(); let summarySeen = false;
  for (let index = 0; index < rows.length; index++) {
    const cells = rows[index];
    if (cells[0] === '总交易单数') {
      const totals = rows[index + 1];
      ensure(index === rows.length - 2 && totals?.length === cells.length && Number(totals[0]) === result.length, 'STATEMENT_TOTAL_MISMATCH');
      const total = (name: string) => decimalMinor(totals[cells.indexOf(name)] || '', name === '手续费总金额');
      ensure(total('手续费总金额') === result.reduce((sum, line) => sum + line.fees, 0)
        && total('订单总金额') === result.filter((line) => line.kind === 'payment').reduce((sum, line) => sum + line.amount, 0)
        && total('申请退款总金额') === result.filter((line) => line.kind === 'refund').reduce((sum, line) => sum + line.amount, 0), 'STATEMENT_TOTAL_MISMATCH');
      summarySeen = true; break;
    }
    ensure(cells.length === headers.length && result.length < 10000, 'STATEMENT_ROW_INVALID');
    const row = Object.fromEntries(headers.map((key, i) => [key, cells[i]]));
    ensure(row['商户号'] === merchantId && row['公众账号ID'] === appId && row['货币种类'] === 'CNY', 'STATEMENT_IDENTITY_MISMATCH');
    ensure(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row['交易时间']) && row['交易时间'].startsWith(date), 'STATEMENT_DATE_MISMATCH');
    ensure(['SUCCESS', 'REFUND'].includes(row['交易状态']), 'STATEMENT_TRADE_TYPE_UNSUPPORTED');
    const kind = row['交易状态'] === 'SUCCESS' ? 'payment' : 'refund';
    const targetId = row[kind === 'payment' ? '商户订单号' : '商户退款单号'];
    const unique = `${kind}:${targetId}`;
    ensure(targetId.length > 0 && targetId.length <= 64 && !seen.has(unique), 'STATEMENT_DUPLICATE_REFERENCE'); seen.add(unique);
    const fees = decimalMinor(row['手续费'], true);
    ensure(kind === 'payment' ? fees >= 0 : fees <= 0, 'STATEMENT_FEE_SIGN_INVALID');
    result.push({ kind, targetId, paymentId: row['商户订单号'], receiptId: row[kind === 'payment' ? '微信订单号' : '微信退款单号'],
      amount: decimalMinor(row[kind === 'payment' ? '订单金额' : '申请退款金额']), fees,
      settlementBasis: decimalMinor(row[kind === 'payment' ? '应结订单金额' : '退款金额']),
      status: kind === 'payment' ? 'SUCCESS' : row['退款状态'], occurredAt: row['交易时间'].replace(' ', 'T') + '+08:00' });
  }
  ensure(summarySeen, 'STATEMENT_SUMMARY_REQUIRED');
  return result;
}
export function validDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function csvExport(rows: unknown[][]) {
  return '\uFEFF' + rows.map((row) => row.map((value) => {
    let cell = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
    return `"${cell.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
}
