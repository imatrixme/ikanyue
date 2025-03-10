<template>
    <view class="pricing-container">
        <view class="pricing-header">
            <text class="pricing-title">价目表</text>
        </view>
        <view class="pricing-list">
            <view v-for="(item, index) in pricingItems" :key="index" class="pricing-card">
                <view class="card-header">
                    <text class="card-title">{{ item.title }}</text>
                    <text class="card-price">¥{{ item.price }}</text>
                </view>
                <view class="card-body">
                    <text class="card-description">{{ item.description }}</text>
                </view>
                <view class="card-footer">
                    <text class="card-saving">节省 {{ item.savingPercentage }}%</text>
                </view>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';

export default {
    data() {
        return {
            pricingItems: [],
            useMockData: true, // 控制是否使用模拟数据
        };
    },
    onLoad(options) {
        this.fetchPricingData();
    },
    methods: {
        async fetchPricingData() {},
    },
};
</script>

<style lang="scss">
.pricing-container {
    padding: 20px;
    padding-top: 100px;
    height: 100vh;
    background-color: #f8f8f8;
}

.pricing-header {
    margin-bottom: 20px;
}

.pricing-title {
    font-size: 24px;
    font-weight: bold;
    color: #333;
}

.pricing-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.pricing-card {
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

.card-header {
    padding: 16px;
    background-color: #f0f0f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.card-title {
    font-size: 18px;
    font-weight: bold;
    color: #333;
}

.card-price {
    font-size: 20px;
    font-weight: bold;
    color: #4caf50;
}

.card-body {
    padding: 16px;
}

.card-description {
    font-size: 14px;
    color: #666;
    line-height: 1.5;
}

.card-footer {
    padding: 12px 16px;
    background-color: #f9f9f9;
}

.card-saving {
    font-size: 14px;
    color: #e91e63;
    font-weight: bold;
}
</style>
