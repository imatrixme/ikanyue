export async function launchCashier({ action, requestPayment, refresh }) {
  if (!action || action.type !== 'wechatpay' || action.mock !== false) {
    throw new Error('当前不是已启用的微信支付通道');
  }
  const p = action.parameters;
  if (!p || p.signType !== 'RSA' || !/^prepay_id=\w+$/.test(p.package || '')
    || !p.timeStamp || !p.nonceStr || !p.paySign) throw new Error('支付信息无效，请刷新订单');
  try { await requestPayment({ timeStamp: p.timeStamp, nonceStr: p.nonceStr, package: p.package, signType: 'RSA', paySign: p.paySign }); }
  catch (error) {
    if (!String(error?.errMsg || '').includes('cancel')) throw new Error('付款结果待确认，请查询订单');
  } finally { await refresh(); }
}
