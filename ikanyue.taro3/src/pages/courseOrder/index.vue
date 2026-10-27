<template>
  <page-chrome class="commerce-page commerce-order-page">
    <view class="commerce-content">
      <view v-if="error || !order" class="commerce-state">
        <async-state :state="error ? 'error' : 'loading'" :kind="error ? 'network' : 'default'" :description="error" :action-label="error ? '重新加载' : ''" @action="load" />
      </view>
      <template v-else>
        <view v-if="order.mockPayment" class="commerce-notice">模拟支付环境，不会扣除真实款项</view>
        <ticket-section :title="order.name" :subtitle="orderStatus(order)">
          <view class="commerce-order-list">
            <account-row :title="order.status === 'pending' || order.status === 'failed' ? '应付金额' : '实付金额'" :value="`¥${money(order.amount)}`" />
            <account-row v-if="order.refunded" title="已退款" :value="`¥${money(order.refunded)}`" />
            <account-row v-if="order.cancellationFees" title="取消预约扣费" :value="`¥${money(order.cancellationFees)}`" />
          </view>
        </ticket-section>
        <ticket-section title="退费规则">
          <text class="commerce-policy">{{ policyText(order.policy) }}</text>
        </ticket-section>
        <view class="commerce-actions">
          <template v-if="order.status === 'pending'">
            <button v-if="order.mockPayment" :disabled="busy" class="commerce-primary" @tap="pay">模拟付款</button>
            <button v-else :disabled="busy" class="commerce-primary" @tap="wechatPay">微信支付</button>
          </template>
          <button v-if="bookable" :disabled="busy" class="commerce-primary" @tap="book">选择时间预约</button>
          <button v-if="order.status === 'failed'" :disabled="busy" class="commerce-primary" @tap="shop">重新选购</button>
          <button v-if="settling" :disabled="busy" class="commerce-secondary" @tap="refresh">查询最新状态</button>
          <button v-if="bookable" :disabled="busy" class="commerce-link" @tap="refund">申请退还剩余课时</button>
        </view>
        <text v-if="order.status === 'pending'" class="commerce-policy">{{ pendingNotice }}</text>
        <text v-if="order.refundPending" class="commerce-policy">退款结果确认期间，待退款的剩余课时暂停使用。</text>
      </template>
    </view>
  </page-chrome>
</template>
<script>
import Taro from '@tarojs/taro';
import { Commerce } from '../../../utils/commerce';
import { withCommandKey } from '../../../utils/commandKeys';
import { launchCashier } from '../../../utils/cashier';
import AccountRow from '../../components/AccountRow.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import TicketSection from '../../components/TicketSection.vue';
import { PENDING_ORDER_NOTICE, money, orderStatus, policyText } from '../courseShop/presentation';
import './index.scss';

export default {
  components: { AccountRow, AsyncState, PageChrome, TicketSection },
  data: () => ({ id: '', order: null, busy: false, error: '', pendingNotice: PENDING_ORDER_NOTICE }),
  computed: {
    bookable() { return this.order?.status === 'completed' && this.order.availableQuantity > 0 && !this.order.refundPending; },
    // Only unsettled orders can change after a manual check.
    settling() { return ['pending', 'granting'].includes(this.order?.status) || Boolean(this.order?.refundPending); },
  },
  onLoad(query) { this.id = query.id || ''; },
  onShow() { this.load(); },
  async onPullDownRefresh() { try { await this.refresh(); } finally { Taro.stopPullDownRefresh(); } },
  methods: {
    money, orderStatus, policyText,
    // Replace the order page so back from booking returns to the shop instead of a settled order.
    book() { Taro.switchTab({ url: '/pages/appointmentBooking/index' }); },
    shop() {
      const pages = Taro.getCurrentPages();
      if (pages[pages.length - 2]?.route === 'pages/courseShop/index') Taro.navigateBack();
      else Taro.redirectTo({ url: '/pages/courseShop/index' });
    },
    async load() {
      this.error = '';
      try { this.order = await Commerce.order(this.id); }
      catch (error) { this.error = error.message || '订单暂时无法加载'; }
    },
    async act(action) {
      if (this.busy) return;
      this.busy = true;
      try { await action(); await this.load(); }
      catch (error) { Taro.showToast({ title: error.message || '结果确认中，请稍后重试', icon: 'none' }); }
      finally { this.busy = false; }
    },
    refresh() { return this.act(() => Commerce.refresh(this.id)); },
    pay() { return this.act(() => Commerce.mockPay(this.id)); },
    wechatPay() { return this.act(async () => launchCashier({ action: await Commerce.cashier(this.id),
      requestPayment: (parameters) => Taro.requestPayment(parameters), refresh: () => Commerce.refresh(this.id) })); },
    refund() {
      return this.act(async () => {
        const preview = await Commerce.preview(this.id);
        if (preview.blocked || preview.amount <= 0) {
          await Taro.showModal({ title: '暂时无法退款', content: preview.blocked ? preview.message : '没有可退的剩余课时', showCancel: false }); return;
        }
        const choice = await Taro.showModal({ title: `预计退款 ¥${money(preview.amount)}`,
          content: '原路退回，确认前相应课时暂停使用。', confirmText: '申请退款' });
        if (!choice.confirm) return;
        await withCommandKey(`refund:${this.id}:${preview.amount}`, (key) => Commerce.refund(this.id, key, preview.amount));
      });
    },
  },
};
</script>
