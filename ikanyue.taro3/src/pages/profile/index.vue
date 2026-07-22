<template>
    <page-chrome class="profile-page">
        <view class="profile-hero">
            <image class="profile-hero__texture" :src="heroTexture" mode="aspectFill" aria-hidden="true" />
            <view class="profile-brand">
                <text class="profile-brand__eyebrow">KANYUE MUSIC ACADEMY</text>
                <text class="profile-brand__name">看乐艺术</text>
                <text class="profile-brand__meta">MUSICIAN PROFILE</text>
            </view>

            <view v-if="isLogin()" class="profile-member-pass" @tap="modifyInfo">
                <view class="profile-member-pass__copy">
                    <text class="profile-member-pass__eyebrow">KANYUE MUSIC ACADEMY</text>
                    <text class="profile-member-pass__name">{{ displayName }}</text>
                    <text class="profile-member-pass__meta">学员账号 {{ maskedPhone }}</text>
                    <text class="profile-member-pass__meta">会员状态 已连接</text>
                </view>
                <view class="profile-member-pass__seal">
                    <text>K</text>
                    <text>MEMBER</text>
                </view>
                <view class="profile-member-pass__barcode" aria-hidden="true">
                    <view v-for="line in 14" :key="line" class="profile-member-pass__barcode-line" />
                </view>
            </view>
        </view>

        <view class="profile-content">
            <template v-if="isLogin()">
                <ticket-section subtitle="查看余额、可领取实物和积分记录" title="积分账户">
                    <view class="profile-row-group">
                        <account-row
                            description="查看可领取实物和解锁进度"
                            icon="account-points"
                            interactive
                            title="查看我的积分"
                            @select="goPoints"
                        />
                        <account-row
                            description="查看批次、兑换规则和课次预约状态"
                            icon-text="课"
                            interactive
                            title="查看我的课程点"
                            @select="goCourseCredits"
                        />
                    </view>
                </ticket-section>

                <ticket-section action-label="进入修改" subtitle="用于身份识别与活动联系" title="账号资料" @action="modifyInfo">
                    <view class="profile-row-group">
                        <account-row icon="account-name" title="显示名称" :value="displayName" />
                        <account-row icon="account-phone" title="绑定手机" :value="maskedPhone" />
                        <account-row
                            description="昵称、姓名、性别、年龄与地区"
                            icon="account-profile"
                            interactive
                            title="个人资料"
                            @select="modifyInfo"
                        />
                    </view>
                </ticket-section>
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

            <ticket-section class="profile-info-section" subtitle="课程介绍与品牌信息" title="了解看乐">
                <view class="profile-row-group">
                    <account-row
                        v-for="link in kanyueInfoLinks"
                        :key="link.id"
                        :description="link.description"
                        :icon="link.icon"
                        interactive
                        :title="link.title"
                        @select="openKanyueInfo(link)"
                    />
                </view>
            </ticket-section>
        </view>

        <nut-popup
            position="bottom"
            :visible="showLogin"
            @close="handleLoginPopupClose"
            :close-on-click-overlay="true"
            class="login-popup-shell"
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
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { UserManager } from '../../../utils/usermanager';
import { Api } from '../../../utils/apis';
import AccountRow from '../../components/AccountRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import TicketSection from '../../components/TicketSection.vue';
import { KANYUE_INFO_LINKS, buildImageDetailUrl } from '../../data/kanyueInfoLinks';
import heroTexture from '../../imgs/textures/hero-music.png';
import './index.scss';

export default {
    components: { AccountRow, PageChrome, TicketSection },
    data() {
        return {
            heroTexture,
            showLogin: false,
            kanyueInfoLinks: KANYUE_INFO_LINKS,
            userInfo: {},
            wechatLoginLoading: false,
            wechatProfileLoading: false,
            wechatUserInfo: null,
        };
    },
    computed: {
        displayName() {
            return this.userInfo.nickName || this.userInfo.nickname || this.userInfo.realName || this.userInfo.cellphone || '看乐学员';
        },
        maskedPhone() {
            const cellphone = String(this.userInfo.cellphone || '');
            if (cellphone.length < 7) return cellphone || '已登录账号';
            return `${cellphone.slice(0, 3)}****${cellphone.slice(-4)}`;
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
        goCourseCredits() {
            Taro.navigateTo({ url: '/pages/courseCredits/index' });
        },
        openKanyueInfo(link) {
            const url = buildImageDetailUrl(link);
            if (url) {
                Taro.navigateTo({ url });
            }
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
