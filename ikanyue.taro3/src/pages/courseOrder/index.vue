<template>
  <page-chrome class="commerce-page commerce-order-page" tone="immersive">
    <page-header eyebrow="COURSE ORDER" title="课程订单" />
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
      <button v-if="order.mockPayment" :disabled="busy" class="commerce-primary" @tap="pay">模拟付款</button>
      <button v-else-if="order.status === 'pending'" :disabled="busy" class="commerce-primary" @tap="wechatPay">微信支付</button>
      <button v-if="order.status === 'completed' && order.availableQuantity > 0 && !order.refundPending" :disabled="busy" class="commerce-primary" @tap="book">选择时间预约</button>
      <button :disabled="busy" class="commerce-secondary" @tap="refresh">查询最新状态</button>
      <button v-if="order.status === 'completed' && order.availableQuantity > 0 && !order.refundPending" :disabled="busy" class="commerce-secondary" @tap="refund">退还剩余课时</button>
      </view>
      <text v-if="order.refundPending" class="commerce-policy">退款结果确认期间，待退款的剩余课时暂停使用。</text>
    </template>
    </view>
  </page-chrome>
</template>
<script>
import Taro from '@tarojs/taro';
import { Commerce } from '../../../utils/commerce';
import { launchCashier } from '../../../utils/cashier';
import AccountRow from '../../components/AccountRow.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import TicketSection from '../../components/TicketSection.vue';
import { money, orderStatus, policyText } from '../courseShop/presentation';
import './index.scss';

export default {
  components: { AccountRow, AsyncState, PageChrome, PageHeader, TicketSection },
  data: () => ({ id: '', order: null, busy: false, error: '' }),
  onLoad(query) { this.id = query.id || ''; },
  onShow() { this.load(); },
  async onPullDownRefresh() { try { await this.refresh(); } finally { Taro.stopPullDownRefresh(); } },
  methods: {
    money, orderStatus, policyText,
    book() { Taro.navigateTo({ url: '/pages/appointmentBooking/index' }); },
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
          content: `${preview.message}。提交后相应课时暂停使用。`, confirmText: '申请退款' });
        if (!choice.confirm) return;
        const storageKey = `commerce-refund-${this.id}`;
        const key = Taro.getStorageSync(storageKey) || `refund-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        Taro.setStorageSync(storageKey, key);
        await Commerce.refund(this.id, key, preview.amount); Taro.removeStorageSync(storageKey);
      });
    },
  },
};
</script>
