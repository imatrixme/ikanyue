<template>
    <page-chrome class="userinfo-page">
        <page-header centered class="userinfo-hero" subtitle="完善资料，便于我们提供更好的服务" title="编辑个人资料">
            <template #leading>
                <view class="userinfo-avatar">
                    <image v-if="avatarUrl" class="userinfo-avatar__image" :src="avatarUrl" mode="aspectFill" />
                    <text v-else>{{ displayInitial }}</text>
                    <view class="userinfo-avatar__camera">+</view>
                </view>
            </template>
        </page-header>

        <view class="userinfo-content">
            <ticket-section subtitle="用于学员识别" title="基本资料">
                <view class="userinfo-form-sheet">

                <form-row label="昵称">
                    <input
                        v-model="form.nickName"
                        class="userinfo-field__input"
                        maxlength="24"
                        placeholder="请输入昵称"
                        type="text"
                    />
                </form-row>

                <form-row label="姓名">
                    <input
                        v-model="form.realName"
                        class="userinfo-field__input"
                        maxlength="24"
                        placeholder="请输入姓名"
                        type="text"
                    />
                </form-row>

                <form-row label="性别">
                    <segmented-control v-model="form.gender" class="userinfo-segmented" :options="genderOptions" />
                </form-row>

                <form-row label="年龄">
                    <input
                        v-model="form.age"
                        class="userinfo-field__input"
                        maxlength="3"
                        placeholder="请输入年龄"
                        type="number"
                    />
                </form-row>

                <form-row label="省份">
                    <picker
                        class="userinfo-picker"
                        mode="selector"
                        :range="provinceOptions"
                        :value="provinceIndex"
                        @change="handleProvinceChange"
                    >
                        <view class="userinfo-picker__value">
                            <text>{{ form.province || '请选择省份' }}</text>
                            <app-icon class="userinfo-picker__arrow" name="chevron-primary" size="sm" />
                        </view>
                    </picker>
                </form-row>
                </view>
            </ticket-section>

            <ticket-section subtitle="微信登录凭证不可在这里修改" title="登录账号">
                <view class="userinfo-form-sheet">
                    <account-row icon="account-phone" title="绑定手机" :value="maskedPhone" />
                </view>
            </ticket-section>

            <view class="userinfo-note">
                <app-icon class="userinfo-note__marker" name="info-blue" size="sm" />
                <text>档案资料仅用于学员身份识别、活动联系和线下服务，不会在积分商品列表中公开。</text>
            </view>

            <button class="userinfo-save" :loading="saving" :disabled="saving" @tap="saveInfo">保存资料</button>

            <view class="userinfo-account-actions">
                <text class="userinfo-account-actions__label">账号操作</text>
                <button class="userinfo-logout" @tap="confirmLogout">
                    <app-icon name="logout-red" size="md" />
                    <text>退出登录</text>
                </button>
            </view>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AccountRow from '../../components/AccountRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import FormRow from '../../components/FormRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import TicketSection from '../../components/TicketSection.vue';
import { themeColors } from '../../styles/theme.mjs';
import {
    GENDER_OPTIONS,
    PROVINCE_OPTIONS,
    buildUserUpdatePayload,
    hydrateUserInfoForm,
    persistUserInfoUpdate,
    validateUserUpdatePayload,
} from './pageLogic';
import './index.scss';

export default {
    components: { AccountRow, AppIcon, FormRow, PageChrome, PageHeader, SegmentedControl, TicketSection },
    data() {
        return {
            avatarUrl: '',
            form: hydrateUserInfoForm(),
            genderOptions: GENDER_OPTIONS,
            provinceOptions: PROVINCE_OPTIONS,
            saving: false,
        };
    },
    computed: {
        displayInitial() {
            return (this.form.nickName || this.form.realName || '看').slice(0, 1);
        },
        provinceIndex() {
            const index = this.provinceOptions.indexOf(this.form.province || '未设置');
            return index >= 0 ? index : 0;
        },
        maskedPhone() {
            const cellphone = String(this.form.cellphone || '');
            if (cellphone.length < 7) return cellphone || '未提供';
            return `${cellphone.slice(0, 3)}****${cellphone.slice(-4)}`;
        },
    },
    mounted() {
        this.refreshForm();
    },
    onShow() {
        this.refreshForm();
    },
    async onPullDownRefresh() {
        try {
            if (!UserManager.isLogin()) {
                this.refreshForm();
                return;
            }
            await Api.refreshLogin();
            this.refreshForm();
        } catch (error) {
            Taro.showToast({ title: error?.message || '资料刷新失败', icon: 'none' });
        } finally {
            Taro.stopPullDownRefresh();
        }
    },
    methods: {
        refreshForm() {
            if (!UserManager.isLogin()) {
                Taro.switchTab({ url: '/pages/profile/index' });
                return;
            }
            const userInfo = UserManager.getUserInfo();
            this.form = hydrateUserInfoForm(userInfo);
            this.avatarUrl = userInfo.avatarUrl || userInfo.avatar || '';
        },
        handleProvinceChange(event) {
            const index = Number(event?.detail?.value || 0);
            const province = this.provinceOptions[index] || '';
            this.form.province = province === '未设置' ? '' : province;
        },
        async saveInfo() {
            if (this.saving) {
                return;
            }
            const payload = buildUserUpdatePayload(this.form);
            const validationMessage = validateUserUpdatePayload(payload);
            if (validationMessage) {
                Taro.showToast({ title: validationMessage, icon: 'none' });
                return;
            }

            this.saving = true;
            Taro.showLoading({ title: '保存中' });
            let saved = false;
            let saveError = '';
            try {
                await persistUserInfoUpdate({
                    payload,
                    refreshLogin: Api.refreshLogin,
                    updateUserInfo: Api.updateUserInfo,
                });
                this.refreshForm();
                saved = true;
            } catch (error) {
                saveError = error?.message || '保存失败，请重试';
            } finally {
                this.saving = false;
                Taro.hideLoading();
            }
            if (saved) {
                Taro.showToast({ title: '资料已更新', icon: 'success' });
            } else if (saveError) {
                Taro.showToast({ title: saveError, icon: 'none' });
            }
        },
        async confirmLogout() {
            const result = await Taro.showModal({
                title: '退出登录',
                content: '退出后需要重新使用微信手机号登录。',
                confirmText: '退出',
                confirmColor: themeColors.danger,
            });
            if (!result.confirm) {
                return;
            }
            UserManager.logout();
            Taro.showToast({ title: '已退出', icon: 'none' });
            setTimeout(() => Taro.switchTab({ url: '/pages/profile/index' }), 300);
        },
    },
};
</script>
