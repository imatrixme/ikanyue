<template>
    <view class="profile-page">
        <view class="profile-card">
            <image class="profile-logo" :src="images.logo" mode="widthFix" />
            <text class="profile-title">看乐积分</text>
            <text class="profile-desc">登录后查看积分余额和可兑换实物。</text>

            <view class="profile-user" v-if="isLogin()">
                <text class="profile-user__name">{{ displayName }}</text>
                <text class="profile-user__phone">{{ userInfo.cellphone || '已登录账号' }}</text>
                <view class="profile-actions">
                    <nut-button type="primary" class="profile-action" @click="goPoints">查看积分</nut-button>
                    <nut-button type="default" class="profile-action" @click="logout">退出登录</nut-button>
                </view>
            </view>

            <view class="profile-login" v-else>
                <nut-button type="primary" class="profile-login__button" @click="showLoginPopup">登录 / 注册</nut-button>
            </view>
        </view>

        <nut-popup
            position="bottom"
            :visible="showLogin"
            @close="handleLoginPopupClose"
            :close-on-click-overlay="true"
            closeable
            :style="{ height: '54%', borderTopLeftRadius: '14px', borderTopRightRadius: '14px' }"
            @click-overlay="handleLoginPopupClose"
            @click-close-icon="handleLoginPopupClose"
        >
            <view class="login-popup">
                <view class="login-title">微信手机号登录</view>
                <view class="login-desc">
                    <text>用于绑定你的积分账户，查看可兑换实物。</text>
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
import './index.scss';

export default {
    data() {
        return {
            images: {
                logo: require('../../imgs/logo_kanyue@512.png'),
            },
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
    },
    mounted() {
        this.refreshUserInfo();
    },
    onShow() {
        this.refreshUserInfo();
    },
    methods: {
        isLogin() {
            return UserManager.isLogin();
        },
        refreshUserInfo() {
            this.userInfo = UserManager.getUserInfo();
            if (!UserManager.isLogin()) {
                return;
            }
            Api.refreshLogin()
                .then(() => {
                    this.userInfo = UserManager.getUserInfo();
                })
                .catch(() => {
                    UserManager.logout();
                    this.userInfo = {};
                });
        },
        goPoints() {
            Taro.switchTab({ url: '/pages/points/index' });
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
                const result = await Taro.getUserProfile({ desc: '用于完善积分账户资料' });
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
        logout() {
            UserManager.logout();
            this.userInfo = {};
            Taro.showToast({ title: '已退出', icon: 'none' });
        },
    },
};
</script>
