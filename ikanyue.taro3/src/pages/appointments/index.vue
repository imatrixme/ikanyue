<template>
    <page-chrome class="appointments-page">

        <view class="appointments-content">
            <segmented-control :model-value="statusFilter" :options="filters" @change="selectFilter" />

            <view v-if="state !== 'ready'" class="appointments-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="errorMessage || emptyDescription"
                    :kind="state === 'error' ? 'network' : 'default'"
                    :state="state"
                    :title="state === 'error' ? '预约记录加载失败' : '暂无预约记录'"
                    @action="loadPage(true)"
                />
            </view>
            <view v-else class="appointments-list">
                <appointment-row
                    v-for="appointment in items"
                    :key="appointment.appointmentId"
                    :appointment="appointment"
                    :perspective="role"
                    @select="goDetail"
                />
            </view>

            <view v-if="loadingMore" class="appointments-footer">正在加载更多</view>
            <view v-else-if="items.length && !hasMore" class="appointments-footer">已显示全部预约</view>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { RoleManager } from '../../../utils/rolemanager';
import AppointmentRow from '../../components/AppointmentRow.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import {
    appointmentDetailUrl, bookingErrorMessage, hasNextPage, mergeAppointmentPage,
    normalizeAppointmentPage,
} from './pageLogic';
import './index.scss';

const FILTERS = Object.freeze([
    { label: '全部', value: '' },
    { label: '待确认', value: 'pending' },
    { label: '已确认', value: 'confirmed,rescheduled' },
    { label: '已结束', value: 'fulfilled,declined,withdrawn,cancelled,expired,slot_taken,eligibility_lost' },
]);

export default {
    components: { AppointmentRow, AsyncState, PageChrome, SegmentedControl },
    data() {
        return {
            errorMessage: '', filters: FILTERS, items: [], loading: false, loadingMore: false,
            pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 0 },
            requestSerial: 0, role: 'student', statusFilter: '',
        };
    },
    computed: {
        activeFilter() { return this.filters.find((item) => item.value === this.statusFilter) || this.filters[0]; },
        emptyDescription() {
            return this.role === 'teacher'
                ? '当前筛选下没有需要处理或已确认的预约。'
                : '发起课程预约后，申请状态会显示在这里。';
        },
        hasMore() { return hasNextPage(this.pagination); },
        state() {
            if (this.loading) return 'loading';
            if (this.errorMessage) return 'error';
            return this.items.length ? 'ready' : 'empty';
        },
    },
    onLoad() {
        const status = Taro.getCurrentInstance()?.router?.params?.status || '';
        if (this.filters.some((item) => item.value === status)) this.statusFilter = status;
    },
    onShow() {
        this.role = RoleManager.getRole();
        RoleManager.applyTabBar(this.role);
        Taro.setNavigationBarTitle({ title: this.role === 'teacher' ? '预约管理' : '我的预约' });
        this.loadPage(true);
    },
    async onPullDownRefresh() {
        try { await this.loadPage(true); } finally { Taro.stopPullDownRefresh(); }
    },
    onReachBottom() { if (this.hasMore) this.loadPage(false); },
    methods: {
        goDetail(item) { Taro.navigateTo({ url: appointmentDetailUrl(item.appointmentId) }); },
        selectFilter(value) {
            if (value === this.statusFilter) return;
            this.statusFilter = value;
            this.loadPage(true);
        },
        async loadPage(reset = false) {
            if ((this.loading || this.loadingMore) && !reset) return;
            const requestId = reset ? this.requestSerial + 1 : this.requestSerial;
            if (reset) this.requestSerial = requestId;
            const page = reset ? 1 : this.pagination.page + 1;
            if (reset) {
                this.loading = true;
                this.loadingMore = false;
                this.errorMessage = '';
            } else {
                this.loadingMore = true;
            }
            try {
                const params = { page, perPage: 20 };
                if (this.statusFilter) params.status = this.statusFilter;
                const response = this.role === 'teacher'
                    ? await Api.listTeacherAppointments(params)
                    : await Api.listStudentAppointments(params);
                if (requestId !== this.requestSerial) return;
                const normalized = normalizeAppointmentPage(response);
                this.items = reset ? normalized.items : mergeAppointmentPage(this.items, normalized.items);
                this.pagination = {
                    page: normalized.page,
                    perPage: normalized.perPage,
                    totalItems: normalized.totalItems,
                    totalPages: normalized.totalPages,
                };
            } catch (error) {
                if (requestId !== this.requestSerial) return;
                if (reset) this.errorMessage = bookingErrorMessage(error, '预约记录暂时无法加载');
                else Taro.showToast({ title: bookingErrorMessage(error, '加载失败'), icon: 'none' });
            } finally {
                if (requestId === this.requestSerial) {
                    this.loading = false;
                    this.loadingMore = false;
                }
            }
        },
    },
};
</script>
