import { request } from './http'

export interface MoneyRecord {
  id: string
  reference: string
  amount: number
  status: string
  createdAt: string
  name: string
  student: { name: string; cellphone: string } | null
  fulfillment?: string
  refunded?: number
}
export interface FinanceSummary {
  provider: string
  captured: number
  refunded: number
  refundReserved: number
  fees: number | null
  settled: number | null
  payments: MoneyRecord[]
  refunds: MoneyRecord[]
  findings: Array<{ id: string; data: { targetId: string; reason: string; occurredAt: string } }>
  mockEnabled: boolean
}
const base = `${import.meta.env.VITE_OPS_API_BASE || '/ops'}/commerce`
export interface CommerceOrder {
  cancellationFees?: number
  id: string; name: string; amount: number; refunded: number; status: string; refundPending: boolean; createdAt: string
  student: { id: string; name: string; cellphone: string }
}
export interface OrderDetail extends CommerceOrder {
  quote: { amount: number; blocked: boolean; message: string }
  batches: Array<{ id: string; name: string; original: number; available: number; reserved: number; consumed: number; expired: number; reversed: number }>
  refunds: Array<{ id: string; amount: number; status: string; kind?: string; createdAt: string; actor?: { reason: string } }>
  audit: Array<{ id: string; actorId: string; actorName?: string; action: string; reason: string; createdAt: string }>
  payment: { status: string } | null; paymentUnavailable: boolean
}
export interface OrderPage { items: CommerceOrder[]; page: number; perPage: number; totalPages: number; totalItems: number }
export interface OfferPolicy { version: number; packageRefund: 'unused_paid_value'; reservationRefund?: 'cash'; cancellationTiers: Array<{ beforeMinutes: number; feeBps: number }> }
export interface Offer { id: string; version: number; name: string; packageId: string; priceVersionId: string; status: 'draft' | 'active' | 'inactive'; policy: OfferPolicy }
export interface OfferCatalog { offers: Offer[]; packages: Array<{ id: string; name: string }>; prices: Array<{ id: string; packageId: string; amount: number; currency: string; version: number }> }
export interface CommerceCase { id: string; orderId: string; label: string; kind: string; status: string; note: string; createdAt: string; student?: { name: string; cellphone: string }; orderName?: string; amount?: number }
export interface Statement { id: string; date: string; source: string; mock: boolean; ready: boolean; fees: number; captured: number; refundRequested: number; count: number }
export interface StatementDetail extends Statement { hash: string; lines: Array<{ id: string; kind: string; amount: number; fees: number; difference: string; resolution?: { note: string } }>; missingPayments: string[]; missingRefunds?: string[]; settlements: Array<{ id: string; amount: number; date: string; reference: string }> }
export interface RecoveryWork { id: string; data: { task: string; targetId: string; attempts: number; exhausted: boolean; lastError?: string } }
export const commerceApi = {
  recoveryWork: (token: string) => request<{ items: RecoveryWork[] }>(`${base}/recovery-work`, { token }),
  resumeWork: (token: string, id: string, reason: string) => request(`${base}/recovery-work/${id}/retry`, { token, method: 'POST', body: { reason } }),
  statements: (token: string) => request<{ items: Statement[] }>(`${base}/statements`, { token }),
  statement: (token: string, id: string) => request<StatementDetail>(`${base}/statements/${id}`, { token }),
  downloadStatement: (token: string, date: string) => request<StatementDetail>(`${base}/statements/download`, { token, method: 'POST', body: { date } }),
  importStatement: (token: string, date: string, content: string) => request<StatementDetail>(`${base}/statements/import`, { token, method: 'POST', body: { date, content } }),
  exportStatement: (token: string, id: string) => request<{ content: string }>(`${base}/statements/${id}/export`, { token }),
  resolveStatementLine: (token: string, id: string, note: string) => request(`${base}/statement-lines/${id}/resolve`, { token, method: 'POST', body: { note } }),
  recordSettlement: (token: string, id: string, body: { date: string; amount: number; reference: string; evidenceHash: string }) => request(`${base}/statements/${id}/settlement`, { token, method: 'POST', body }),
  retryRefund: (token: string, id: string, reason: string) => request(`${base}/refunds/${encodeURIComponent(id)}/retry`, { token, method: 'POST', body: { reason } }),
  offers: (token: string) => request<OfferCatalog>(`${base}/offers`, { token }),
  saveOffer: (token: string, body: { key: string; id?: string; version?: number; name: string; packageId: string; priceVersionId: string; policy: OfferPolicy }) => request<Offer>(`${base}/offers`, { token, method: 'POST', body }),
  publishOffer: (token: string, offer: Offer, status: 'active' | 'inactive', reason: string) => request<Offer>(`${base}/offers/${offer.id}/status`, { token, method: 'POST', body: { status, reason, version: offer.version || 0 } }),
  cases: (token: string) => request<CommerceCase[]>(`${base}/cases`, { token }),
  reviewCase: (token: string, id: string, status: string, note: string) => request(`${base}/cases/${encodeURIComponent(id)}`, { token, method: 'POST', body: { status, note } }),
  orders: (token: string, query: Record<string, string>) => request<OrderPage>(`${base}/orders?${new URLSearchParams(query)}`, { token }),
  order: (token: string, id: string) => request<OrderDetail>(`${base}/orders/${encodeURIComponent(id)}`, { token }),
  refundOrder: (token: string, id: string, body: { key: string; expectedAmount: number; reason: string }) => request(`${base}/orders/${encodeURIComponent(id)}/refunds`, { token, method: 'POST', body }),
  recoverOrder: (token: string, id: string, reason: string) => request<OrderDetail>(`${base}/orders/${encodeURIComponent(id)}/recover`, { token, method: 'POST', body: { reason, key: crypto.randomUUID() } }),
  finance: (token: string) => request<FinanceSummary>(`${base}/finance`, { token }),
  reconcile: (token: string) => request<{ findings: unknown[] }>(`${base}/reconcile`, { token, method: 'POST', body: {} }),
  recover: (token: string) => request<{ orders: { unresolved: number }; refunds: { unresolved: number } }>(`${base}/recover`, { token, method: 'POST', body: {} }),
  mockRefund: (token: string, id: string) => request(`${base}/refunds/${encodeURIComponent(id)}/mock-success`, { token, method: 'POST', body: {} }),
}
export const orderLabel = (order: CommerceOrder) => order.refundPending ? '退款处理中' : ({ pending: '待付款', granting: '已付款，课时待到账', completed: order.refunded >= order.amount ? '已全额退款' : '已完成', failed: '付款未完成' } as Record<string, string>)[order.status] || '待核对'
export const money = (value: number | null) => value === null ? '尚未提供' : `¥${(value / 100).toFixed(2)}`
export function moneyStatus(record: MoneyRecord, refund = false) {
  if (!refund && record.status === 'succeeded' && record.fulfillment !== 'completed') return '已收款，课时待到账'
  return ({ pending: refund ? '退款处理中' : '待付款', processing: '退款处理中', succeeded: refund ? '退款成功' : '收款成功',
    failed: refund ? '退款失败' : '付款失败', closed: '支付已关闭' } as Record<string, string>)[record.status] || '状态待核对'
}
export const findingLabel = (reason: string) => ({ LATE_PAYMENT_SUCCESS: '支付关闭后收到成功回执', AMOUNT_MISMATCH: '金额不一致', MISSING_GATEWAY_RECORD: '支付记录缺失',
  UNAPPLIED_SUCCESS: '渠道成功结果尚未同步', MISSING_PROVIDER_SUCCESS: '缺少渠道成功凭证' } as Record<string, string>)[reason] || '需要人工核对'
