<template>
    <view class="container">
        <view class="unloginview" v-if="!isLogin()">
            <image class="logo" :src="images.logo" mode="widthFix" />
            <view class="content">
                <text class="incname">看乐艺术</text>
                <text class="slogan">提高歌唱水平，提升音乐认知</text>
            </view>
            <nut-button type="primary" class="loginbtn" @click="showLoginPopup">登录·注册</nut-button>
        </view>

        <view class="loginview" v-if="isLogin()">
            <image class="avatar" :src="userInfo.avatar" mode="widthFix" />
            <view class="content">
                <text class="nickname">{{ userInfo.nickName }}</text>
                <text class="province" v-if="userInfo.province !== undefined">{{ userInfo.province }}</text>
            </view>
            <nut-button type="default" class="modifybtn" @click="modifyInfo">修改信息</nut-button>
        </view>

        <!-- 登录弹窗 -->
        <nut-popup
            position="bottom"
            :visible="showLogin"
            @close="showLogin = false"
            :close-on-click-overlay="true"
            closeable
            :style="{ height: '55%', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }"
            @click-overlay="showLogin = false"
            @click-close-icon="showLogin = false"
        >
            <view class="login-popup">
                <view class="login-header">
                    <view class="login-title">账号登录</view>
                </view>
                <view class="login-form">
                    <nut-input
                        v-model="loginForm.phone"
                        placeholder="请输入手机号"
                        type="digit"
                        class="login-input"
                        clearable
                    />
                    <nut-input
                        v-model="loginForm.password"
                        placeholder="请输入密码"
                        type="password"
                        class="login-input"
                        clearable
                    />
                    <nut-button
                        type="primary"
                        block
                        class="login-submit-btn"
                        @click="handlePasswordLogin"
                        :loading="loading"
                    >
                        登录
                    </nut-button>
                </view>
            </view>
        </nut-popup>
    </view>
</template>

<script>
import Taro, { getCurrentInstance } from '@tarojs/taro';
import { UserManager } from '../../../utils/usermanager';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

export default {
    data() {
        return {
            dayjs: dayjs,
            images: {
                logo: require('../../imgs/kanyuelogo.png'),
            },
            userInfo: undefined,
            showLogin: false,
            loading: false,
            loginForm: {
                phone: '',
                password: '',
            },
        };
    },
    mounted() {
        this.refreshUserInfo();
    },
    methods: {
        isLogin() {
            return this.userInfo !== undefined && this.userInfo.token !== undefined;
        },
        refreshUserInfo() {
            this.userInfo = UserManager.getUserInfo();
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
        // 处理密码登录
        handlePasswordLogin() {
            // 表单验证
            if (!this.loginForm.phone || !this.loginForm.password) {
                Taro.showToast({
                    title: '请输入手机号和密码',
                    icon: 'none',
                });
                return;
            }

            // 手机号格式验证
            if (!/^1\d{10}$/.test(this.loginForm.phone)) {
                Taro.showToast({
                    title: '请输入正确的手机号',
                    icon: 'none',
                });
                return;
            }

            this.loading = true;

            UserManager.loginWithPassword(this.loginForm.phone, this.loginForm.password)
                .then((res) => {
                    this.showLogin = false;
                    this.refreshUserInfo();
                    Taro.showToast({
                        title: '登录成功',
                        icon: 'success',
                    });
                })
                .catch((err) => {
                    Taro.showToast({
                        title: err.message || '登录失败，请重试',
                        icon: 'none',
                    });
                })
                .finally(() => {
                    this.loading = false;
                });
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

    .login-form {
        flex: 1;
        display: flex;
        flex-direction: column;

        .login-input {
            margin-top: 20px;
        }

        .login-submit-btn {
            margin-top: 30px;
            height: 45px;
            border-radius: 22px;
            font-size: 16px;
            background: linear-gradient(to right, #ff4949, #ff7f50);
            border: none;
            box-shadow: 0 3px 10px rgba(255, 73, 73, 0.3);
        }
    }
}
</style>
