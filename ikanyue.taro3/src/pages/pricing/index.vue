<template>
    <view class="page-wrapper">
        <!-- 分类选择器 - 左侧 -->
        <view class="category-column">
            <scroll-view scroll-y="true" :style="{ height: scrollHeight + 'px' }" show-scrollbar="false" enhanced>
                <view
                    v-for="(category, index) in categories"
                    :key="index"
                    class="category-item"
                    :class="{ active: selectedCategoryIndex === index }"
                    @tap="selectCategory(index, category)"
                >
                    <nut-icon :name="category.icon" size="20" class="category-icon"></nut-icon>
                    <text class="category-name">{{ category.name }}</text>
                </view>
            </scroll-view>
        </view>

        <!-- 价格列表 - 右侧 -->
        <view class="content-column">
            <scroll-view
                scroll-y="true"
                :style="{ height: scrollHeight + 'px' }"
                show-scrollbar="false"
                enhanced
                @scrolltolower="onScrollToLower"
            >
                <view v-if="loading" class="status-box">
                    <nut-icon name="loading" size="20"></nut-icon>
                    <text class="loading-text">加载中...</text>
                </view>

                <view v-else-if="networkError" class="status-box">
                    <nut-empty description="网络错误，点击重试"></nut-empty>
                    <nut-button type="primary" size="small" @click="loadPricingData" style="margin-top: 10px">
                        重新加载
                    </nut-button>
                </view>

                <view v-else-if="!currentPricing.length" class="status-box">
                    <nut-empty description="暂无价格方案"></nut-empty>
                </view>

                <view v-else class="pricing-cards">
                    <view
                        v-for="(item, index) in currentPricing"
                        :key="index"
                        class="pricing-card"
                        :class="{ popular: item.isPopular }"
                        @tap="showPricingDetail(item)"
                    >
                        <view class="card-header">
                            <view class="price-tier">{{ item.tier }}</view>
                            <view class="price-container">
                                <text class="price-symbol">¥</text>
                                <text class="price-amount">{{ item.price }}</text>
                                <text class="price-unit">{{ item.unit }}</text>
                            </view>
                            <view class="price-desc">{{ item.description }}</view>
                        </view>

                        <view class="card-body">
                            <view class="features-list">
                                <view v-for="(feature, fIdx) in item.features" :key="fIdx" class="feature-item">
                                    <nut-icon name="checked" size="16"></nut-icon>
                                    <text>{{ feature }}</text>
                                </view>
                            </view>
                        </view>

                        <view class="card-footer">
                            <text class="discount-tag" v-if="item.discount">{{ item.discount }}% 优惠</text>
                            <text class="original-price" v-if="item.originalPrice">¥{{ item.originalPrice }}</text>
                        </view>
                    </view>
                </view>
            </scroll-view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';

export default {
    data() {
        return {
            // 分类列表
            categories: [
                { name: '一对一', icon: 'service', type: 'one-on-one' },
                { name: '小班课', icon: 'people', type: 'small-group' },
                { name: '线上课程', icon: 'computer', type: 'online' },
                { name: '线下工作坊', icon: 'location', type: 'workshop' },
                { name: '节日活动', icon: 'gift', type: 'festival' },
                { name: '会员套餐', icon: 'membership-card', type: 'membership' },
            ],
            // 全部价格数据
            allPricing: [],
            // 当前显示的价格数据（根据分类筛选）
            currentPricing: [],
            // 选中的分类索引
            selectedCategoryIndex: 0,
            // 当前选中的分类
            currentCategory: null,
            // 加载状态
            loading: true,
            // 网络错误状态
            networkError: false,
            // 滚动区域高度
            scrollHeight: 600,
            // 模拟数据（实际开发中应该通过 API 获取）
            mockData: {
                'one-on-one': [
                    {
                        tier: '单次体验',
                        price: 299,
                        unit: '/次',
                        description: '专业教师一对一指导，适合体验和初次尝试',
                        features: ['60分钟课程', '专业教师指导', '基础教学内容', '免费学习资料'],
                        discount: null,
                        originalPrice: null,
                        isPopular: false,
                    },
                    {
                        tier: '月度套餐',
                        price: 1280,
                        unit: '/月',
                        description: '每周一次，全方位提升歌唱水平',
                        features: [
                            '每周一次，每次60分钟',
                            '专业教师一对一指导',
                            '个性化进阶课程',
                            '专属学习计划',
                            '课后辅导支持',
                        ],
                        discount: 15,
                        originalPrice: 1499,
                        isPopular: true,
                    },
                    {
                        tier: '季度套餐',
                        price: 3580,
                        unit: '/季度',
                        description: '持续稳定学习，全面提升演唱技巧',
                        features: [
                            '每周一次，每次60分钟',
                            '高级教师一对一指导',
                            '定制化学习方案',
                            '声乐理论与实践结合',
                            '月度进度评估',
                            '专属演出机会',
                        ],
                        discount: 20,
                        originalPrice: 4477,
                        isPopular: false,
                    },
                ],
                'small-group': [
                    {
                        tier: '小班体验课',
                        price: 99,
                        unit: '/次',
                        description: '3-5人小班授课，感受团体学习氛围',
                        features: ['90分钟课程', '互动教学模式', '基础演唱技巧', '同伴交流学习'],
                        discount: null,
                        originalPrice: null,
                        isPopular: false,
                    },
                    {
                        tier: '小班月度课程',
                        price: 680,
                        unit: '/月',
                        description: '每周一次小班课，共同进步',
                        features: [
                            '每周一次，每次90分钟',
                            '3-5人小班授课',
                            '系统化教学内容',
                            '小组练习活动',
                            '每月一次汇报演出',
                        ],
                        discount: 15,
                        originalPrice: 799,
                        isPopular: true,
                    },
                    {
                        tier: '小班季度课程',
                        price: 1880,
                        unit: '/季度',
                        description: '长期小班学习，稳定提升演唱水平',
                        features: [
                            '每周一次，每次90分钟',
                            '固定小班人员配置',
                            '进阶教学计划',
                            '专业录音体验',
                            '季度汇报演出',
                            '优先参与艺术活动',
                        ],
                        discount: 20,
                        originalPrice: 2340,
                        isPopular: false,
                    },
                ],
                'online': [
                    {
                        tier: '在线单课',
                        price: 129,
                        unit: '/次',
                        description: '灵活在线学习，随时随地提升',
                        features: ['45分钟在线课程', '专业教师指导', '录制课程回放', '在线互动答疑'],
                        discount: null,
                        originalPrice: null,
                        isPopular: false,
                    },
                    {
                        tier: '在线月卡',
                        price: 499,
                        unit: '/月',
                        description: '每周在线学习，突破地域限制',
                        features: [
                            '每周一次，每次45分钟',
                            '在线一对一指导',
                            '课程录制回放',
                            '专属学习资料',
                            '随时在线答疑',
                        ],
                        discount: 22,
                        originalPrice: 639,
                        isPopular: true,
                    },
                    {
                        tier: '在线季卡',
                        price: 1380,
                        unit: '/季度',
                        description: '长期在线学习，全面提升',
                        features: [
                            '每周一次，每次45分钟',
                            '高级教师在线指导',
                            '定制化学习计划',
                            '无限回看课程',
                            '优先预约时段',
                            '线上演出机会',
                        ],
                        discount: 25,
                        originalPrice: 1839,
                        isPopular: false,
                    },
                ],
                'workshop': [
                    {
                        tier: '周末工作坊',
                        price: 398,
                        unit: '/次',
                        description: '周末集中学习，快速掌握技巧',
                        features: ['3小时集中训练', '小组互动学习', '实战演唱指导', '成果展示环节'],
                        discount: null,
                        originalPrice: null,
                        isPopular: false,
                    },
                    {
                        tier: '主题工作坊',
                        price: 598,
                        unit: '/次',
                        description: '针对特定曲风或技巧的专题训练',
                        features: ['4小时专题训练', '专业名师指导', '深度技巧讲解', '实战演练环节', '小组展示与点评'],
                        discount: null,
                        originalPrice: null,
                        isPopular: true,
                    },
                    {
                        tier: '强化训练营',
                        price: 1880,
                        unit: '/期',
                        description: '一周密集训练，迅速提升',
                        features: [
                            '7天集中训练',
                            '每天4小时专业指导',
                            '系统化教学内容',
                            '一对一指导环节',
                            '结业汇报演出',
                            '专业录音体验',
                        ],
                        discount: 15,
                        originalPrice: 2210,
                        isPopular: false,
                    },
                ],
                'festival': [
                    {
                        tier: '节日单场活动',
                        price: 199,
                        unit: '/人',
                        description: '节日主题活动，欢乐学习',
                        features: ['2小时主题活动', '节日氛围体验', '互动演唱环节', '精美活动纪念品'],
                        discount: null,
                        originalPrice: null,
                        isPopular: false,
                    },
                    {
                        tier: '节日系列活动',
                        price: 499,
                        unit: '/人',
                        description: '参与多场节日活动，持续体验',
                        features: ['3场节日主题活动', '每场2小时', '专业教师指导', '主题演唱体验', '活动视频记录'],
                        discount: 17,
                        originalPrice: 599,
                        isPopular: true,
                    },
                ],
                'membership': [
                    {
                        tier: '普通会员',
                        price: 365,
                        unit: '/年',
                        description: '每天1元，畅享会员权益',
                        features: ['所有课程9折优惠', '免费参加月度讲座', '会员专属资料库', '优先报名活动'],
                        discount: null,
                        originalPrice: null,
                        isPopular: false,
                    },
                    {
                        tier: '高级会员',
                        price: 880,
                        unit: '/年',
                        description: '更多高级权益，加速进步',
                        features: [
                            '所有课程8折优惠',
                            '每月1次免费体验课',
                            '专属会员活动',
                            '高级教学资料库',
                            '会员专属交流群',
                        ],
                        discount: null,
                        originalPrice: null,
                        isPopular: true,
                    },
                    {
                        tier: 'VIP会员',
                        price: 1980,
                        unit: '/年',
                        description: '尊享VIP服务，全方位提升',
                        features: [
                            '所有课程7折优惠',
                            '每季度1次免费一对一课程',
                            'VIP专属活动',
                            '优先预约名师',
                            '专业演出推荐机会',
                            '年度音乐会门票',
                        ],
                        discount: 20,
                        originalPrice: 2475,
                        isPopular: false,
                    },
                ],
            },
        };
    },
    onLoad() {
        // 计算页面高度并设置滚动区域高度
        this.setScrollHeight();

        // 初始化第一个分类
        this.currentCategory = this.categories[0];

        // 加载价格数据
        this.loadPricingData();
    },
    onShow() {
        // 每次显示页面时重新计算高度
        this.setScrollHeight();

        // 每次显示页面时自动刷新数据，但保持当前筛选条件
        if (this.allPricing && Object.keys(this.allPricing).length > 0) {
            this.refreshPricingData();
        }
    },
    onReady() {
        // 页面渲染完成后再次确认高度
        this.setScrollHeight();
    },
    // 添加下拉刷新的生命周期方法
    onPullDownRefresh() {
        // 重新加载数据，保持当前的筛选条件，并显示提示
        this.refreshPricingData(true); // 传入true表示需要显示提示
    },
    methods: {
        // 设置滚动高度
        setScrollHeight() {
            try {
                const res = Taro.getSystemInfoSync();
                // 设置滚动区域高度为窗口高度
                this.scrollHeight = res.windowHeight;
                console.log('设置滚动高度:', this.scrollHeight);
            } catch (e) {
                console.error('获取系统信息失败:', e);
            }
        },

        // 滚动到底部
        onScrollToLower() {
            console.log('滚动到底部');
            // 加载更多的逻辑
        },

        // 刷新价格数据但保持当前筛选条件
        async refreshPricingData(showToast = false) {
            // 记住当前的筛选索引
            const currentIndex = this.selectedCategoryIndex;

            try {
                // 重新加载全部数据
                await this.loadPricingData(false); // 传入false参数表示静默加载

                // 恢复之前的筛选条件
                this.selectedCategoryIndex = currentIndex;
                this.currentCategory = this.categories[currentIndex];
                this.filterPricingByCategory();

                // 只在需要显示提示时才显示（如手动下拉刷新）
                if (showToast) {
                    Taro.showToast({
                        title: '刷新成功',
                        icon: 'success',
                        duration: 1500,
                    });
                }
            } catch (error) {
                console.error('刷新价格数据失败:', error);
                if (showToast) {
                    Taro.showToast({
                        title: '刷新失败',
                        icon: 'none',
                        duration: 1500,
                    });
                }
            } finally {
                // 停止下拉刷新动画（如果存在）
                Taro.stopPullDownRefresh();
            }
        },

        // 加载价格数据
        async loadPricingData(showLoading = true) {
            if (showLoading) {
                this.loading = true;
            }
            this.networkError = false;

            try {
                // 模拟API请求延迟
                await new Promise((resolve) => setTimeout(resolve, 500));

                // 直接使用模拟数据
                this.allPricing = this.mockData;

                // 筛选当前选择的分类的价格数据
                this.filterPricingByCategory();

                this.loading = false;
            } catch (error) {
                console.error('加载价格数据失败:', error);
                this.networkError = true;
                if (showLoading) {
                    Taro.showToast({
                        title: '加载失败，请点击重试',
                        icon: 'none',
                    });
                }
                this.loading = false;
            }
        },

        // 选择分类
        selectCategory(index, category) {
            this.selectedCategoryIndex = index;
            this.currentCategory = category;
            this.filterPricingByCategory();
        },

        // 根据选中的分类筛选价格
        filterPricingByCategory() {
            if (!this.currentCategory || !this.allPricing) {
                this.currentPricing = [];
                return;
            }

            const categoryType = this.currentCategory.type;
            this.currentPricing = this.allPricing[categoryType] || [];
        },

        // 显示价格详情
        showPricingDetail(item) {
            // 这里可以实现点击价格卡片后的操作，例如显示详情或进入购买流程
            Taro.showToast({
                title: `您选择了${item.tier}`,
                icon: 'none',
            });
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
