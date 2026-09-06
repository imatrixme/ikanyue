export type Kind = 'payment' | 'refund' | 'event' | 'provider' | 'reconciliation' | 'idempotency' | 'wechat_mock' | 'work' | 'audit' | 'statement' | 'statement_line' | 'settlement';
export interface Row<T = unknown> { id: string; kind: Kind; owner: string; version: number; data: T }
export interface Mutation { row: Row; expected: number }
export interface Store {
  get<T>(id: string): Promise<Row<T> | null>;
  list<T>(kind: Kind, owner: string): Promise<Row<T>[]>;
  commit(changes: Mutation[]): Promise<void>;
}
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'closed';
export interface Payment {
  reference: string; amount: number; currency: 'CNY'; status: PaymentStatus;
  refunded: number; reserved: number; fingerprint: string; createdAt: string;
  paidAt?: string; late?: boolean;
  channel?: 'wechatpay'; payerId?: string; description?: string; prepayId?: string; prepayAt?: string;
}
export interface Refund {
  paymentId: string; amount: number; status: 'processing' | 'succeeded' | 'failed';
  reference: string; fingerprint: string; createdAt: string;
}
export interface Observation {
  targetId: string; targetKind: 'payment' | 'refund'; amount: number;
  status: 'pending' | 'succeeded' | 'failed' | 'closed'; observedAt: string;
  receiptId?: string; exception?: string;
  acceptedAt?: string;
}
export interface GatewayEvent {
  type: string; targetId: string; payload: Payment | Refund;
  occurredAt: string; acknowledged: boolean;
}
export interface Finding { targetId: string; reason: string; occurredAt: string }
