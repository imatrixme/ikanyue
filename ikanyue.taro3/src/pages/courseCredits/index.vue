<template>
    <page-chrome class="course-credit-page" tone="immersive">
        <page-header
            eyebrow="COURSE CREDITS"
            subtitle="不同课程的课时分别使用；通用兑换额度需要先换成对应课程课时。"
            title="我的课时"
        >
            <view class="course-credit-hero-stats">
                <view class="course-credit-hero-stat">
                    <text class="course-credit-hero-stat__value">{{ summary.totals.available }}</text>
                    <text class="course-credit-hero-stat__label">可用课时</text>
                </view>
                <view class="course-credit-hero-stat">
                    <text class="course-credit-hero-stat__value">{{ summary.totals.frozen }}</text>
                    <text class="course-credit-hero-stat__label">未来课程占用</text>
                </view>
                <view class="course-credit-hero-stat">
                    <text class="course-credit-hero-stat__value">{{ summary.totals.expiring }}</text>
                    <text class="course-credit-hero-stat__label">近期到期</text>
                </view>
            </view>
        </page-header>

        <view class="course-credit-content">
            <view v-if="!isLogin" class="course-credit-state">
                <async-state
                    action-label="前往登录"
                    description="登录后可以查看可用课时、有效期和课程预约状态。"
                    kind="account"
                    state="empty"
                    title="登录后查看课时"
                    @action="goProfile"
                />
            </view>
            <view v-else-if="state !== 'ready'" class="course-credit-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '报课获得课时后会显示在这里。'"
                    :kind="state === 'error' ? 'network' : 'points'"
                    :state="state"
                    :title="state === 'empty' ? '暂无可用课时' : ''"
                    @action="loadData"
                />
            </view>
            <template v-else>
                <ticket-section
                    v-if="summary.universal.length"
                    action-label="去兑换"
                    subtitle="只作为交换价值，不直接扣课"
                    title="通用兑换额度"
                    @action="goConversion"
                >
                    <course-credit-summary-row
                        v-for="item in summary.universal"
                        :key="item.creditType.id"
                        class="course-credit-summary-section"
                        :item="item"
                        :warning-days="summary.warningDays"
                        @select="goBatches"
                    />
                </ticket-section>

                <ticket-section
                    v-if="summary.exact.length"
                    action-label="全部来源"
                    subtitle="不同课程不可直接互相抵扣"
                    title="课程课时"
                    @action="goBatches()"
                >
                    <course-credit-summary-row
                        v-for="item in summary.exact"
                        :key="item.creditType.id"
                        class="course-credit-summary-section"
                        :item="item"
                        :warning-days="summary.warningDays"
                        @select="goBatches"
                    />
                </ticket-section>

                <ticket-section subtitle="兑换、变动记录和课程状态" title="课时工具">
                    <view class="course-credit-quick-links">
                        <account-row icon-text="换" interactive title="课时兑换" description="先查看兑换数量和有效期" @select="goConversion" />
                        <account-row icon-text="课" interactive title="课程与预约" description="查看课时是否够用或需要兑换" @select="goSessions" />
                        <account-row icon-text="记" interactive title="课时变动" description="查看到账、预约占用、使用和退回" @select="goHistory" />
                    </view>
                </ticket-section>

                <ticket-section action-label="全部课程" subtitle="最近的课时使用状态" title="近期课程" @action="goSessions">
                    <view v-if="sessions.length" class="course-credit-list">
                        <course-credit-session-row v-for="item in sessions" :key="item.sessionStudentId" :record="item" @action="goSessions" />
                    </view>
                    <view v-else class="course-credit-note">暂无关联课次，班级排课后会显示预约和结算状态。</view>
                </ticket-section>
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AccountRow from '../../components/AccountRow.vue';
import AsyncState from '../../components/AsyncState.vue';
import CourseCreditSessionRow from '../../components/CourseCreditSessionRow.vue';
import CourseCreditSummaryRow from '../../components/CourseCreditSummaryRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import TicketSection from '../../components/TicketSection.vue';
import { courseCreditErrorMessage, normalizePage, normalizeSummary, pageState } from './pageLogic';
import './index.scss';

export default {
    components: {
        AccountRow, AsyncState, CourseCreditSessionRow, CourseCreditSummaryRow,
        PageChrome, PageHeader, TicketSection,
    },
    data() {
        return {
            errorMessage: '',
            isLogin: false,
            loading: false,
            sessions: [],
            summary: normalizeSummary(),
        };
    },
    computed: {
        state() {
            return pageState({
                error: this.errorMessage,
                items: [...this.summary.items, ...this.sessions],
                loading: this.loading,
            });
        },
    },
    mounted() { this.loadData(); },
    onShow() { this.loadData(); },
    async onPullDownRefresh() {
        try { await this.loadData(true); } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        goProfile() { Taro.switchTab({ url: '/pages/profile/index' }); },
        goBatches(item) {
            const id = item?.creditType?.id || '';
            const name = item?.creditType?.name || '全部课时';
            Taro.navigateTo({ url: `/pages/courseCreditBatches/index?creditTypeId=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}` });
        },
        goConversion() { Taro.navigateTo({ url: '/pages/courseCreditConversion/index' }); },
        goHistory() { Taro.navigateTo({ url: '/pages/courseCreditHistory/index' }); },
        goSessions() { Taro.navigateTo({ url: '/pages/courseCreditSessions/index' }); },
        async loadData(force = false) {
            if (this.loading && !force) return;
            this.isLogin = UserManager.isLogin();
            if (!this.isLogin) {
                this.summary = normalizeSummary();
                this.sessions = [];
                this.errorMessage = '';
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try {
                const [summary, sessions] = await Promise.all([
                    Api.getCourseCreditSummary(), Api.listCourseCreditSessions({ page: 1, perPage: 3 }),
                ]);
                this.summary = normalizeSummary(summary);
                this.sessions = normalizePage(sessions).items;
            } catch (error) {
                this.errorMessage = courseCreditErrorMessage(error);
            } finally {
                this.loading = false;
            }
        },
    },
};
</script>
