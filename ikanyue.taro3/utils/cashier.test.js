import { describe, it, expect, vi } from 'vitest';
import { launchCashier } from './cashier';
describe('cashier safety', () => {
  const action = { type: 'wechatpay', mock: false, parameters: { timeStamp: '123', nonceStr: 'nonce', package: 'prepay_id=wxid', signType: 'RSA', paySign: 'signed' } };
  it('mock responses never open the real WeChat cashier', async () => {
    const requestPayment = vi.fn(); const refresh = vi.fn();
    await expect(launchCashier({ action: { ...action, mock: true }, requestPayment, refresh })).rejects.toThrow();
    expect(requestPayment).not.toHaveBeenCalled();
  });
  it('client success, cancellation and uncertainty all query the business order', async () => {
    const refresh = vi.fn();
    await launchCashier({ action, requestPayment: vi.fn(), refresh });
    await launchCashier({ action, requestPayment: vi.fn().mockRejectedValue({ errMsg: 'requestPayment:fail cancel' }), refresh });
    await expect(launchCashier({ action, requestPayment: vi.fn().mockRejectedValue({ errMsg: 'timeout' }), refresh })).rejects.toThrow();
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
