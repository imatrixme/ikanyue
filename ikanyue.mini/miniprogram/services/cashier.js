import { pay } from '../kit/api.js';

// Opens the WeChat cashier only for a real (non-mock) prepay. Success, cancellation and an unknown
// outcome all re-read the business order; only the unknown outcome is reported as an error.
export async function launchCashier({ action, refresh }) {
  if (!action || action.type !== 'wechatpay' || action.mock !== false) {
    throw new Error('当前不是已启用的微信支付通道');
  }
  const p = action.parameters;
  if (!p || p.signType !== 'RSA' || !/^prepay_id=\w+$/.test(p.package || '')
    || !p.timeStamp || !p.nonceStr || !p.paySign) throw new Error('支付信息无效，请刷新订单');
  try { return await pay({ timeStamp: p.timeStamp, nonceStr: p.nonceStr, package: p.package, signType: 'RSA', paySign: p.paySign }); }
  finally { await refresh(); }
}
