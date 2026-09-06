import { object } from './adapter';
import type { Row } from '../types';

export function mockBill(date: string, rows: Row<{ kind: string; targetId: string; state: string;
  request: Record<string, unknown>; succeededAt?: string; createdAt: string }>[], identity: { appId: string; merchantId: string }) {
  const headers = ['交易时间', '公众账号ID', '商户号', '微信订单号', '商户订单号', '交易状态', '货币种类',
    '应结订单金额', '微信退款单号', '商户退款单号', '退款金额', '退款状态', '手续费', '订单金额', '申请退款金额'];
  let captured = 0; let refunds = 0; let fees = 0;
  const lines = rows.filter(({ data }) => (data.kind === 'refund' || data.state === 'SUCCESS')
    && chinaTime(data.kind === 'refund' ? data.createdAt : data.succeededAt || '').startsWith(date)).map(({ data }) => {
    const refund = data.kind === 'refund'; const amount = Number(object(data.request.amount)[refund ? 'refund' : 'total']);
    const fee = refund && data.state !== 'SUCCESS' ? 0 : Math.floor(amount * 0.006) * (refund ? -1 : 1); fees += fee;
    if (refund) refunds += amount; else captured += amount;
    const paymentId = refund ? String(data.request.out_trade_no) : data.targetId;
    return [chinaTime(refund ? data.createdAt : data.succeededAt || ''), identity.appId, identity.merchantId,
      `420000${paymentId}`, paymentId, refund ? 'REFUND' : 'SUCCESS', 'CNY', refund ? '0.00' : yuan(amount),
      refund ? `503000${data.targetId}` : '0', refund ? data.targetId : '0', refund ? yuan(amount) : '0.00',
      refund ? ({ CLOSED: 'FAIL', ABNORMAL: 'CHANGE' } as Record<string, string>)[data.state] || data.state : '',
      yuan(fee), refund ? '0.00' : yuan(amount), refund ? yuan(amount) : '0.00'].map((cell) => '`' + cell).join(',');
  });
  return [headers.join(','), ...lines, '总交易单数,手续费总金额,订单总金额,申请退款总金额',
    [lines.length, yuan(fees), yuan(captured), yuan(refunds)].map((cell) => '`' + cell).join(',')].join('\n') + '\n';
}
const yuan = (value: number) => (value / 100).toFixed(2);
function chinaTime(at: string) { const ms = Date.parse(at); return Number.isFinite(ms) ? new Date(ms + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') : ''; }
