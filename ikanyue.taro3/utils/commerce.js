import { iNet } from './request';

const base = '/v1/student/commerce';
export const Commerce = {
  cashier: (id) => iNet.post(`${base}/orders/${id}/cashier`, {}),
  cancellationPreview: (id) => iNet.get(`${base}/appointments/${id}/cancellation-preview`),
  catalog: () => iNet.get(`${base}/catalog`),
  orders: () => iNet.get(`${base}/orders`),
  checkout: (offerId, key) => iNet.post(`${base}/orders`, { offerId, key }),
  order: (id) => iNet.get(`${base}/orders/${id}`),
  refresh: (id) => iNet.post(`${base}/orders/${id}/refresh`, {}),
  mockPay: (id) => iNet.post(`${base}/orders/${id}/mock-pay`, {}),
  preview: (id) => iNet.get(`${base}/orders/${id}/refund-preview`),
  refund: (id, key, expectedAmount) => iNet.post(`${base}/orders/${id}/refunds`, { key, expectedAmount }),
};
