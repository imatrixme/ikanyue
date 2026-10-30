import { definePage } from '../../kit/page.js';
import { nav, system, ui } from '../../kit/api.js';
import { PAYMENT_PAUSED_NOTICE, PENDING_ORDER_NOTICE, money, orderStatus, paymentPaused, policyText } from '../../core/courseShop.js';
import { launchCashier } from '../../services/cashier.js';
import { withCommandKey } from '../../services/commandKeys.js';
import { Commerce } from '../../services/commerce.js';

definePage({
  data: () => ({ id: '', order: null, busy: false, error: '', pendingNotice: PENDING_ORDER_NOTICE }),
  computed: {
    bookable: (d) => d.order?.status === 'completed' && d.order.availableQuantity > 0 && !d.order.refundPending,
    // Only unsettled orders can change after a manual check.
    settling: (d) => ['pending', 'granting'].includes(d.order?.status) || Boolean(d.order?.refundPending),
    view: (d) => (d.order ? {
      status: orderStatus(d.order),
      amountTitle: ['pending', 'failed'].includes(d.order.status) ? '应付金额' : '实付金额',
      amount: `¥${money(d.order.amount)}`,
      refunded: `¥${money(d.order.refunded)}`,
      cancellationFees: `¥${money(d.order.cancellationFees)}`,
      policy: policyText(d.order.policy),
    } : null),
  },
  onLoad(query) { this.set({ id: query.id || '' }); },
  onShow() { this.load(); },
  onPullDownRefresh() { return this.refresh(); },
  methods: {
    // Replace the order page so back from booking returns to the shop instead of a settled order.
    book() { nav.tab('/pages/appointmentBooking/index'); },
    shop() {
      const routes = system.currentPages();
      if (routes[routes.length - 2] === 'pages/courseShop/index') nav.back();
      else nav.redirect('/pages/courseShop/index');
    },
    async load() {
      await this.set({ error: '' });
      try { await this.set({ order: await Commerce.order(this.data.id) }); }
      catch (error) { await this.set({ error: error.message || '订单暂时无法加载' }); }
    },
    async act(action) {
      if (this.data.busy) return;
      await this.set({ busy: true });
      try { await action(); await this.load(); }
      catch (error) {
        if (paymentPaused(error)) await ui.confirm({ title: '暂时无法支付', content: PAYMENT_PAUSED_NOTICE, showCancel: false });
        else ui.toast(error.message || '结果确认中，请稍后重试');
      }
      finally { await this.set({ busy: false }); }
    },
    refresh() { return this.act(() => Commerce.refresh(this.data.id)); },
    pay() { return this.act(() => Commerce.mockPay(this.data.id)); },
    wechatPay() {
      const { id } = this.data;
      return this.act(async () => launchCashier({ action: await Commerce.cashier(id), refresh: () => Commerce.refresh(id) }));
    },
    refund() {
      const { id } = this.data;
      return this.act(async () => {
        const preview = await Commerce.preview(id);
        if (preview.blocked || preview.amount <= 0) {
          await ui.confirm({ title: '暂时无法退款', content: preview.blocked ? preview.message : '没有可退的剩余课时', showCancel: false });
          return;
        }
        const confirmed = await ui.confirm({ title: `预计退款 ¥${money(preview.amount)}`,
          content: '原路退回，确认前相应课时暂停使用。', okText: '申请退款' });
        if (!confirmed) return;
        await withCommandKey(`refund:${id}:${preview.amount}`, (key) => Commerce.refund(id, key, preview.amount));
      });
    },
  },
});
