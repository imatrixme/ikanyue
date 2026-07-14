<template>
    <view class="userinfo-page">
        <view class="userinfo-hero">
            <view class="userinfo-avatar">
                <image v-if="avatarUrl" class="userinfo-avatar__image" :src="avatarUrl" mode="aspectFill" />
                <text v-else>{{ displayInitial }}</text>
            </view>
            <view class="userinfo-hero__copy">
                <text class="userinfo-hero__title">个人资料</text>
                <text class="userinfo-hero__meta">{{ form.cellphone || '已登录账号' }}</text>
            </view>
        </view>

        <view class="userinfo-content">
            <view class="userinfo-section">
                <view class="userinfo-section__header">
                    <text class="userinfo-section__title">基本资料</text>
                    <text class="userinfo-section__hint">用于学员识别</text>
                </view>

                <label class="userinfo-field">
                    <text class="userinfo-field__label">昵称</text>
                    <input
                        v-model="form.nickName"
                        class="userinfo-field__input"
                        maxlength="24"
                        placeholder="请输入昵称"
                        type="text"
                    />
                </label>

                <label class="userinfo-field">
                    <text class="userinfo-field__label">姓名</text>
                    <input
                        v-model="form.realName"
                        class="userinfo-field__input"
                        maxlength="24"
                        placeholder="请输入姓名"
                        type="text"
                    />
                </label>

                <view class="userinfo-field">
                    <text class="userinfo-field__label">性别</text>
                    <view class="userinfo-segmented">
                        <view
                            v-for="option in genderOptions"
                            :key="option.value"
                            class="userinfo-segmented__item"
                            :class="{ 'userinfo-segmented__item--active': form.gender === option.value }"
                            @tap="form.gender = option.value"
                        >
                            {{ option.label }}
                        </view>
                    </view>
                </view>

                <label class="userinfo-field">
                    <text class="userinfo-field__label">年龄</text>
                    <input
                        v-model="form.age"
                        class="userinfo-field__input"
                        maxlength="3"
                        placeholder="请输入年龄"
                        type="number"
                    />
                </label>

                <view class="userinfo-field">
                    <text class="userinfo-field__label">省份</text>
                    <picker
                        class="userinfo-picker"
                        mode="selector"
                        :range="provinceOptions"
                        :value="provinceIndex"
                        @change="handleProvinceChange"
                    >
                        <view class="userinfo-picker__value">
                            <text>{{ form.province || '请选择省份' }}</text>
                            <app-icon class="userinfo-picker__arrow" name="chevron-red" :size="15" />
                        </view>
                    </picker>
                </view>
            </view>

            <view class="userinfo-section">
                <view class="userinfo-section__header">
                    <text class="userinfo-section__title">登录账号</text>
                    <text class="userinfo-section__hint">不可修改</text>
                </view>
                <view class="userinfo-field userinfo-field--readonly">
                    <text class="userinfo-field__label">绑定手机</text>
                    <text class="userinfo-field__value">{{ form.cellphone || '未提供' }}</text>
                </view>
            </view>

            <view class="userinfo-note">
                <app-icon class="userinfo-note__marker" name="info-blue" :size="16" />
                <text>档案资料仅用于学员身份识别、活动联系和线下服务，不会在积分商品列表中公开。</text>
            </view>

            <button class="userinfo-save" :loading="saving" :disabled="saving" @tap="saveInfo">保存资料</button>

            <view class="userinfo-account-actions">
                <text class="userinfo-account-actions__label">账号操作</text>
                <button class="userinfo-logout" @tap="confirmLogout">
                    <app-icon name="logout-red" :size="17" />
                    <text>退出登录</text>
                </button>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AppIcon from '../../components/AppIcon.vue';
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
    components: { AppIcon },
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
                confirmColor: '#a73b35',
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
