<template>
    <view class="container">
        <view class="unloginview" v-if="!isLogin()">
            <image class="logo" :src="images.logo" mode="widthFix" />
            <view class="content">
                <!-- <text class="incname">看乐艺术</text> -->
                <text class="slogan">提高歌唱水平，提升音乐认知</text>
            </view>
            <nut-button type="primary" class="loginbtn" @click="showLoginPopup">登录·注册</nut-button>
        </view>

        <view class="loginview" v-if="isLogin()">
            <image class="avatar" :src="images.avatar" mode="widthFix" />
            <view class="content">
                <text class="nickname">{{ userInfo.nickname }}</text>
                <text class="province" v-if="userInfo.province !== undefined">{{ userInfo.province }}</text>
            </view>
            <nut-button type="default" class="modifybtn" @click="modifyInfo">修改信息</nut-button>
        </view>

        <!-- 登录弹窗 -->
        <nut-popup
            position="bottom"
            :visible="showLogin"
            @close="handleLoginPopupClose"
            :close-on-click-overlay="true"
            closeable
            :style="{ height: '60%', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }"
            @click-overlay="handleLoginPopupClose"
            @click-close-icon="handleLoginPopupClose"
        >
            <view class="login-popup">
                <view class="login-header">
                    <view class="login-title">账号登录</view>
                </view>
                <view class="login-desc">
                    <text>为了保证账号安全，请使用微信官方授权方式完成登录。</text>
                </view>
                <view class="wechat-login">
                    <button
                        class="wechat-login__phone-btn"
                        open-type="getPhoneNumber"
                        :loading="wechatLoginLoading || wechatProfileLoading"
                        :disabled="wechatLoginLoading || wechatProfileLoading"
                        @tap="handleWechatTap"
                        @getphonenumber="handleWechatPhone"
                    >
                        使用微信手机号一键登录
                    </button>
                    <view class="wechat-login__note">
                        <text>用于同步课堂报名、老师回访等账号服务</text>
                    </view>
                </view>
            </view>
        </nut-popup>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { UserManager } from '../../../utils/usermanager';
import { Api } from '../../../utils/apis';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

export default {
    data() {
        return {
            dayjs: dayjs,
            images: {
                logo: require('../../imgs/kanyue_logo_1.png'),
                avatar: require('../../imgs/kanyue_logo_avatar_1.png'),
            },
            userInfo: undefined,
            showLogin: false,
            wechatUserInfo: null,
            wechatProfileLoading: false,
            wechatLoginLoading: false,
        };
    },
    mounted() {
        this.refreshUserInfo();
    },
    onShow() {
        // 在页面显示时重新获取用户信息，确保从userinfo页面返回时数据是最新的
        this.refreshUserInfo();
    },
    methods: {
        isLogin() {
            return this.userInfo !== undefined && this.userInfo.token !== undefined;
        },
        refreshUserInfo() {
            console.log('开始刷新用户信息');
            // 先从本地获取缓存的用户信息
            this.userInfo = UserManager.getUserInfo();
            console.log('从缓存获取的用户信息:', this.userInfo);

            // 如果已登录，尝试刷新用户信息
            if (UserManager.isLogin()) {
                console.log('检测到已登录状态，开始刷新登录信息');
                Api.refreshLogin()
                    .then((res) => {
                        console.log('刷新登录成功:', res);
                        // 刷新成功后再次从缓存获取更新后的用户信息
                        this.userInfo = UserManager.getUserInfo();
                        console.log('更新后的用户信息:', this.userInfo);
                    })
                    .catch((err) => {
                        console.error('刷新用户信息失败', err);
                        // 如果刷新失败，可能是token过期，尝试清除本地缓存
                        if (this.userInfo && this.userInfo.token) {
                            console.log('清除过期的登录状态');
                            UserManager.logout();
                            this.userInfo = undefined;
                        }
                    });
            } else {
                console.log('用户未登录状态');
            }
        },
        modifyInfo() {
            if (!this.isLogin()) {
                return;
            }
            Taro.navigateTo({ url: '/pages/userinfo/index' });
        },
        // 显示登录弹窗
        showLoginPopup() {
            this.showLogin = true;
            console.log('显示登录弹窗', this.showLogin);
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
                Taro.showToast({
                    title: '当前基础库版本过低，无法授权',
                    icon: 'none',
                });
                return;
            }
            this.wechatProfileLoading = true;
            try {
                const result = await Taro.getUserProfile({
                    desc: '用于完善个人资料',
                });
                this.wechatUserInfo = result.userInfo || null;
            } catch (error) {
                console.error('获取微信用户信息失败', error);
                Taro.showToast({
                    title: '已取消授权',
                    icon: 'none',
                });
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
        async ensureWechatProfile() {
            if (this.wechatUserInfo) {
                return this.wechatUserInfo;
            }
            if (!Taro.getUserProfile) {
                throw new Error('当前基础库版本过低，无法获取微信资料');
            }
            const result = await Taro.getUserProfile({
                desc: '用于完善个人资料',
            });
            this.wechatUserInfo = result.userInfo || null;
            return this.wechatUserInfo;
        },
        async handleWechatPhone(event) {
            if (this.wechatLoginLoading) {
                return;
            }
            const detail = event?.detail || {};
            if (detail.errMsg !== 'getPhoneNumber:ok') {
                Taro.showToast({
                    title: '未获取到手机号',
                    icon: 'none',
                });
                return;
            }
            if (!this.wechatUserInfo) {
                Taro.showToast({
                    title: '请先允许获取头像昵称',
                    icon: 'none',
                });
                return;
            }
            if (!detail.encryptedData || !detail.iv) {
                Taro.showToast({
                    title: '微信未返回手机号信息',
                    icon: 'none',
                });
                return;
            }
            this.wechatLoginLoading = true;
            try {
                await this.ensureWechatProfile();
                const code = await this.ensureWechatCode();
                await Api.loginWithWechat({
                    code,
                    userInfo: this.wechatUserInfo,
                    phone: {
                        encryptedData: detail.encryptedData,
                        iv: detail.iv,
                    },
                });
                this.showLogin = false;
                this.resetWechatAuthState();
                setTimeout(() => {
                    this.refreshUserInfo();
                    this.$forceUpdate();
                }, 100);
                Taro.showToast({
                    title: '登录成功',
                    icon: 'success',
                });
            } catch (error) {
                console.error('微信登录失败', error);
                Taro.showToast({
                    title: error?.message || '登录失败，请重试',
                    icon: 'none',
                });
            } finally {
                this.wechatLoginLoading = false;
            }
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';

.login-popup {
    padding: 20px;
    padding-bottom: 50px;
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;

    .login-header {
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        margin-bottom: 30px;
        margin-top: 10px;

        .login-title {
            font-size: 20px;
            font-weight: bold;
            text-align: center;
        }
    }

    .login-desc {
        font-size: 14px;
        color: #666;
        line-height: 1.6;
        margin-bottom: 12px;
    }
}
</style>
