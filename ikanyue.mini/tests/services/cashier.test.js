import { describe, it, expect, vi } from 'vitest';
import { launchCashier } from '../../miniprogram/services/cashier.js';

const fail = (errMsg) => (options) => options.fail({ errMsg });

describe('cashier safety', () => {
  const action = { type: 'wechatpay', mock: false, parameters: { timeStamp: '123', nonceStr: 'nonce', package: 'prepay_id=wxid', signType: 'RSA', paySign: 'signed' } };
  it('mock responses never open the real WeChat cashier', async () => {
    const refresh = vi.fn();
    await expect(launchCashier({ action: { ...action, mock: true }, refresh })).rejects.toThrow();
    await expect(launchCashier({ action: { ...action, parameters: { ...action.parameters, package: 'x' } }, refresh })).rejects.toThrow('支付信息无效');
    expect(wx.requestPayment).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it('client success, cancellation and uncertainty all query the business order', async () => {
    const refresh = vi.fn();
    await expect(launchCashier({ action, refresh })).resolves.toBe('paid');
    expect(wx.requestPayment.mock.calls[0][0]).toMatchObject({ package: 'prepay_id=wxid', signType: 'RSA' });
    wx.requestPayment.mockImplementation(fail('requestPayment:fail cancel'));
    await expect(launchCashier({ action, refresh })).resolves.toBe('cancelled');
    wx.requestPayment.mockImplementation(fail('requestPayment:fail timeout'));
    await expect(launchCashier({ action, refresh })).rejects.toThrow('付款结果待确认');
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
