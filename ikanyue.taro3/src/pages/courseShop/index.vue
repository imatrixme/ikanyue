<template>
  <page-chrome class="commerce-page commerce-shop-page">
    <view class="commerce-content">
      <segmented-control v-model="mode" :options="modeOptions" />
      <view v-if="error || loading" class="commerce-state">
        <async-state :state="error ? 'error' : 'loading'" :kind="error ? 'network' : 'default'" :description="error" :action-label="error ? '重新加载' : ''" @action="load" />
      </view>
      <template v-else-if="mode === 'catalog'">
        <view v-if="!offers.length" class="commerce-state"><async-state state="empty" kind="default" title="暂无可购买课程" /></view>
        <ticket-section v-else title="课程课包">
          <view v-for="offer in offers" :key="offer.id" class="commerce-item">
            <view class="commerce-item-heading"><app-icon name="course-book" size="xl" /><text class="commerce-title">{{ offer.name }}</text></view>
            <text class="commerce-muted">{{ offer.quantity }}课时 · {{ offer.validityDays ? `购买后${offer.validityDays}天有效` : '有效期以订单为准' }}</text>
            <text class="commerce-price">¥{{ money(offer.amount) }}</text>
            <text class="commerce-policy-link" @tap="showPolicy(offer)">退费规则</text>
            <button :disabled="busy" class="commerce-primary" @tap="buy(offer)">购买</button>
          </view>
        </ticket-section>
      </template>
      <template v-else>
        <view v-if="!orders.length" class="commerce-state"><async-state state="empty" kind="default" title="暂无购买订单" action-label="去选课" @action="mode = 'catalog'" /></view>
        <ticket-section v-else title="购买记录">
          <view class="commerce-order-list">
            <account-row v-for="order in orders" :key="order.id" icon="course-history" interactive :title="order.name" :description="orderStatus(order)" :value="`¥${money(order.amount)}`" @select="openOrder(order.id)" />
          </view>
        </ticket-section>
      </template>
    </view>
  </page-chrome>
</template>
<script>
import Taro from '@tarojs/taro';
import { Commerce } from '../../../utils/commerce';
import { withCommandKey } from '../../../utils/commandKeys';
import AppIcon from '../../components/AppIcon.vue';
import AccountRow from '../../components/AccountRow.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import TicketSection from '../../components/TicketSection.vue';
import { money, orderStatus, policyText } from './presentation';
import './index.scss';

export default {
  components: { AccountRow, AppIcon, AsyncState, PageChrome, SegmentedControl, TicketSection },
  data: () => ({
    mode: 'catalog', offers: [], orders: [], loading: false, busy: false, error: '', keys: {},
    modeOptions: [{ label: '选课购买', value: 'catalog' }, { label: '我的订单', value: 'orders' }],
  }),
  onShow() { this.load(); },
  async onPullDownRefresh() { try { await this.load(); } finally { Taro.stopPullDownRefresh(); } },
  methods: {
    money, orderStatus, policyText,
    async load() {
      this.loading = true; this.error = '';
      try { [this.offers, this.orders] = await Promise.all([Commerce.catalog(), Commerce.orders()]); }
      catch (error) { this.error = error.message || '课程暂时无法加载'; }
      finally { this.loading = false; }
    },
    showPolicy(offer) {
      Taro.showModal({ title: '退费规则', content: policyText(offer.policy), showCancel: false, confirmText: '知道了' });
    },
    openOrder(id) { Taro.navigateTo({ url: `/pages/courseOrder/index?id=${encodeURIComponent(id)}` }); },
    async buy(offer) {
      if (this.busy) return;
      const decision = await Taro.showModal({ title: `应付 ¥${money(offer.amount)}`, content: `${offer.name} · ${offer.quantity}课时\n${policyText(offer.policy)}`, confirmText: '确认下单' });
      if (!decision.confirm) return;
      this.busy = true;
      try {
        const order = await withCommandKey(`checkout:${offer.id}`, (key) => Commerce.checkout(offer.id, key));
        this.openOrder(order.id);
      } catch (error) { Taro.showToast({ title: error.message || '下单结果正在确认，请重试', icon: 'none' }); }
      finally { this.busy = false; }
    },
  },
};
</script>
