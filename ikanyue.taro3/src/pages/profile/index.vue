<template>
    <view class="profile-page">
        <view class="profile-brand">
            <view class="profile-brand__mark">
                <image class="profile-logo" :src="logo" mode="aspectFit" />
            </view>
            <view class="profile-brand__copy">
                <text class="profile-brand__name">看乐艺术</text>
                <text class="profile-brand__meta">MUSICIAN PROFILE</text>
            </view>
        </view>

        <view class="profile-content">
            <template v-if="isLogin()">
                <view class="profile-identity" @tap="modifyInfo">
                    <view class="profile-avatar">
                        <image v-if="avatarUrl" class="profile-avatar__image" :src="avatarUrl" mode="aspectFill" />
                        <text v-else>{{ displayInitial }}</text>
                    </view>
                    <view class="profile-identity__copy">
                        <text class="profile-user__name">{{ displayName }}</text>
                        <text class="profile-user__phone">{{ userInfo.cellphone || '已登录账号' }}</text>
                    </view>
                    <text class="profile-status">已连接</text>
                    <app-icon class="profile-entry-arrow" name="chevron-primary" :size="15" />
                </view>

                <view class="profile-section">
                    <view class="profile-section__header">
                        <text class="profile-section__title">积分账户</text>
                        <text class="profile-section__hint">KANYUE POINTS</text>
                    </view>
                    <view class="profile-command" @tap="goPoints">
                        <view class="profile-command__icon">PT</view>
                        <view class="profile-command__copy">
                            <text class="profile-command__title">查看我的积分</text>
                            <text class="profile-command__desc">查看可领取实物和解锁进度</text>
                        </view>
                        <app-icon class="profile-command__arrow" name="chevron-primary" :size="15" />
                    </view>
                </view>

                <view class="profile-section" @tap="modifyInfo">
                    <view class="profile-section__header">
                        <text class="profile-section__title">账号资料</text>
                        <view class="profile-section__link">
                            <text>进入修改</text>
                            <app-icon name="chevron-primary" :size="14" />
                        </view>
                    </view>
                    <view class="profile-detail-row">
                        <text class="profile-detail-row__label">显示名称</text>
                        <text class="profile-detail-row__value">{{ displayName }}</text>
                    </view>
                    <view class="profile-detail-row">
                        <text class="profile-detail-row__label">绑定手机</text>
                        <text class="profile-detail-row__value">{{ userInfo.cellphone || '未提供' }}</text>
                    </view>
                </view>
            </template>

            <template v-else>
                <view class="profile-welcome">
                    <view class="profile-welcome__bar" />
                    <text class="profile-welcome__eyebrow">MUSICIAN 01</text>
                    <text class="profile-welcome__title">登录你的看乐账户</text>
                    <text class="profile-welcome__desc">绑定微信手机号后，即可查看活动、积分余额和当前可领取的实物。</text>
                    <view class="profile-primary-action" @tap="showLoginPopup">登录 / 注册</view>
                </view>
                <view class="profile-note">
                    <view class="profile-note__dot" />
                    <text>账号仅用于识别学员、活动联系和同步积分。</text>
                </view>
            </template>
        </view>

        <nut-popup
            position="bottom"
            :visible="showLogin"
            @close="handleLoginPopupClose"
            :close-on-click-overlay="true"
            :style="{ height: '52%', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }"
            @click-overlay="handleLoginPopupClose"
        >
            <view class="login-popup">
                <view class="login-popup__close" aria-label="关闭登录弹窗" @tap="handleLoginPopupClose">
                    <text>×</text>
                </view>
                <view class="login-popup__bar" />
                <view class="login-eyebrow">KANYUE ACCOUNT</view>
                <view class="login-title">绑定积分账户</view>
                <view class="login-desc">
                    <text>授权微信头像、昵称和手机号，用于识别学员并同步积分账户。</text>
                </view>
                <button
                    class="wechat-login-btn"
                    open-type="getPhoneNumber"
                    :loading="wechatLoginLoading || wechatProfileLoading"
                    :disabled="wechatLoginLoading || wechatProfileLoading"
                    @tap="handleWechatTap"
                    @getphonenumber="handleWechatPhone"
                >
                    使用微信手机号一键登录
                </button>
            </view>
        </nut-popup>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { UserManager } from '../../../utils/usermanager';
import { Api } from '../../../utils/apis';
import AppIcon from '../../components/AppIcon.vue';
import './index.scss';

const logo = require('../../imgs/logo_kanyue@512.png');

export default {
    components: { AppIcon },
    data() {
        return {
            logo,
            showLogin: false,
            userInfo: {},
            wechatLoginLoading: false,
            wechatProfileLoading: false,
            wechatUserInfo: null,
        };
    },
    computed: {
        displayName() {
            return this.userInfo.nickname || this.userInfo.nickName || this.userInfo.realName || this.userInfo.cellphone || '看乐学员';
        },
        displayInitial() {
            return this.displayName.slice(0, 1);
        },
        avatarUrl() {
            return this.userInfo.avatarUrl || this.userInfo.avatar || '';
        },
    },
    mounted() {
        this.refreshUserInfo();
    },
    onShow() {
        this.refreshUserInfo();
    },
    async onPullDownRefresh() {
        try {
            await this.refreshUserInfo();
        } finally {
            Taro.stopPullDownRefresh();
        }
    },
    methods: {
        isLogin() {
            return UserManager.isLogin();
        },
        async refreshUserInfo() {
            this.userInfo = UserManager.getUserInfo();
            if (!UserManager.isLogin()) {
                return;
            }
            try {
                await Api.refreshLogin();
                this.userInfo = UserManager.getUserInfo();
            } catch {
                this.userInfo = UserManager.getUserInfo();
            }
        },
        goPoints() {
            Taro.switchTab({ url: '/pages/points/index' });
        },
        modifyInfo() {
            if (!UserManager.isLogin()) {
                return;
            }
            Taro.navigateTo({ url: '/pages/userinfo/index' });
        },
        showLoginPopup() {
            this.showLogin = true;
        },
        handleLoginPopupClose() {
            this.showLogin = false;
            this.resetWechatAuthState();
        },
        resetWechatAuthState() {
            this.wechatUserInfo = null;
            this.wechatProfileLoading = false;
            this.wechatLoginLoading = false;
        },
        async handleWechatTap() {
            if (this.wechatUserInfo || this.wechatProfileLoading) {
                return;
            }
            if (!Taro.getUserProfile) {
                Taro.showToast({ title: '当前基础库版本过低，无法授权', icon: 'none' });
                return;
            }
            this.wechatProfileLoading = true;
            try {
                const result = await Taro.getUserProfile({ desc: '用于完善个人资料' });
                this.wechatUserInfo = result.userInfo || null;
            } catch (error) {
                Taro.showToast({ title: '已取消授权', icon: 'none' });
            } finally {
                this.wechatProfileLoading = false;
            }
        },
        async ensureWechatCode() {
            const loginResult = await Taro.login();
            if (!loginResult || !loginResult.code) {
                throw new Error('获取微信登录态失败，请稍后重试');
            }
            return loginResult.code;
        },
        async handleWechatPhone(event) {
            if (this.wechatLoginLoading) {
                return;
            }
            const detail = event?.detail || {};
            if (detail.errMsg !== 'getPhoneNumber:ok') {
                Taro.showToast({ title: '未获取到手机号', icon: 'none' });
                return;
            }
            if (!this.wechatUserInfo) {
                Taro.showToast({ title: '请先允许获取头像昵称', icon: 'none' });
                return;
            }
            if (!detail.encryptedData || !detail.iv) {
                Taro.showToast({ title: '微信未返回手机号信息', icon: 'none' });
                return;
            }
            this.wechatLoginLoading = true;
            try {
                await Api.loginWithWechat({
                    code: await this.ensureWechatCode(),
                    userInfo: this.wechatUserInfo,
                    phone: {
                        encryptedData: detail.encryptedData,
                        iv: detail.iv,
                    },
                });
                this.showLogin = false;
                this.resetWechatAuthState();
                this.refreshUserInfo();
                Taro.showToast({ title: '登录成功', icon: 'success' });
            } catch (error) {
                Taro.showToast({ title: error?.message || '登录失败，请重试', icon: 'none' });
            } finally {
                this.wechatLoginLoading = false;
            }
        },
    },
};
</script>
