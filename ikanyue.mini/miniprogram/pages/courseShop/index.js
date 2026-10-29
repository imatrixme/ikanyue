import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import { money, orderStatus, pendingOrderFor, policyText } from '../../core/courseShop.js';
import { withCommandKey } from '../../services/commandKeys.js';
import { Commerce } from '../../services/commerce.js';

definePage({
  data: () => ({
    mode: 'catalog', offers: [], orders: [], loaded: false, loading: false, busy: false, error: '',
    modeOptions: [{ label: '选课购买', value: 'catalog' }, { label: '我的订单', value: 'orders' }],
  }),
  computed: {
    offerRows: (d) => d.offers.map((offer) => ({
      ...offer,
      price: money(offer.amount),
      validityText: offer.validityDays ? `购买后${offer.validityDays}天有效` : '有效期以订单为准',
    })),
    orderRows: (d) => d.orders.map((order) => ({
      id: order.id, name: order.name, status: orderStatus(order), price: `¥${money(order.amount)}`,
    })),
  },
  onShow() { this.load(); },
  onPullDownRefresh() { return this.load(); },
  methods: {
    changeMode(event) { this.set({ mode: event.detail.value }); },
    showCatalog() { this.set({ mode: 'catalog' }); },
    // Only the first load shows a loading state; later refreshes keep the current list on screen.
    async load() {
      if (this.data.loading) return;
      await this.set({ loading: true });
      try {
        const [offers, orders] = await Promise.all([Commerce.catalog(), Commerce.orders()]);
        await this.set({ offers, orders, error: '', loaded: true });
      } catch (error) {
        if (this.data.loaded) ui.toast('刷新失败，请稍后重试');
        else await this.set({ error: error.message || '课程暂时无法加载' });
      } finally { await this.set({ loading: false }); }
    },
    showPolicy(event) {
      const offer = this.data.offers[event.currentTarget.dataset.index];
      ui.confirm({ title: '退费规则', content: policyText(offer.policy), showCancel: false, okText: '知道了' });
    },
    openOrder(id) { nav.to('/pages/courseOrder/index', { id }); },
    selectOrder(event) { this.openOrder(event.detail.id); },
    async buy(event) {
      if (this.data.busy) return;
      const offer = this.data.offers[event.currentTarget.dataset.index];
      const pending = pendingOrderFor(this.data.orders, offer.id);
      if (pending) {
        ui.toast('你有一笔待付款订单，继续完成支付');
        this.openOrder(pending.id);
        return;
      }
      const confirmed = await ui.confirm({ title: `应付 ¥${money(offer.amount)}`, content: `${offer.name} · ${offer.quantity}课时\n${policyText(offer.policy)}`, okText: '确认下单' });
      if (!confirmed) return;
      await this.set({ busy: true });
      try {
        const order = await withCommandKey(`checkout:${offer.id}`, (key) => Commerce.checkout(offer.id, key));
        this.openOrder(order.id);
      } catch (error) { ui.toast(error.message || '下单结果正在确认，请重试'); }
      finally { await this.set({ busy: false }); }
    },
  },
});
