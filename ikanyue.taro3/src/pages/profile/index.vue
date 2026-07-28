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
                    <text class="profile-member-pass__meta">{{ accountRoleLabel }} {{ maskedPhone }}</text>
                    <text class="profile-member-pass__meta">账户状态 已连接</text>
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
                <ticket-section v-if="role === 'student'" subtitle="查看余额、可领取实物和积分记录" title="积分账户">
                    <view class="profile-row-group">
                        <account-row
                            description="查看可领取实物和解锁进度"
                            icon="account-points"
                            interactive
                            title="查看我的积分"
                            @select="goPoints"
                        />
                        <account-row
                            description="查看剩余课时、课程日程和上课记录"
                            icon="course-book"
                            interactive
                            title="查看我的课程"
                            @select="goCourses"
                        />
                        <account-row
                            description="使用剩余课时选择教师和时间"
                            icon="booking-request"
                            interactive
                            title="课程预约"
                            @select="goBooking"
                        />
                    </view>
                </ticket-section>

                <ticket-section v-else subtitle="处理预约申请并维护教学时间" title="预约教学">
                    <view class="profile-row-group">
                        <account-row
                            description="确认或拒绝学员的预约申请"
                            icon="teacher-workbench"
                            interactive
                            title="预约工作台"
                            @select="goCourses"
                        />
                        <account-row
                            description="查看已经确认的授课时间"
                            icon="booking-confirm"
                            interactive
                            title="预约日历"
                            @select="goPoints"
                        />
                    </view>
                </ticket-section>

                <ticket-section v-if="roleOptions.length > 1" subtitle="同一微信可在已验证身份之间切换" title="当前身份">
                    <view class="profile-row-group">
                        <account-row
                            description="切换后导航和可用功能会同步变化"
                            icon="teacher-role"
                            interactive
                            title="使用身份"
                            :value="role === 'teacher' ? '教师' : '学员'"
                            @select="openRoleSwitcher"
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
                    <text class="profile-welcome__desc">绑定微信手机号后，即可查看活动、课程安排、预约与账户信息。</text>
                    <view class="profile-primary-action" @tap="showLoginPopup">登录 / 注册</view>
                </view>
                <view class="profile-note">
                    <view class="profile-note__dot" />
                    <text>账号仅用于身份识别、课程服务与必要的活动联系。</text>
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
                <view class="login-title">登录看乐账户</view>
                <view class="login-desc">
                    <text>授权微信头像、昵称和手机号，用于识别学员或教师并同步课程与账户信息。</text>
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

        <nut-popup
            position="bottom"
            :visible="showRolePopup"
            :close-on-click-overlay="!roleChallenge"
            class="role-popup-shell"
            @close="closeRoleSwitcher"
            @click-overlay="closeRoleSwitcher"
        >
            <view class="role-popup">
                <view class="login-popup__bar" />
                <view class="login-eyebrow">ACCOUNT ROLE</view>
                <view class="login-title">选择使用身份</view>
                <view class="login-desc">
                    <text>学员身份用于查看课程与发起预约，教师身份用于确认预约和设置可预约时间。</text>
                </view>
                <view class="role-options">
                    <view
                        v-for="option in visibleRoleOptions"
                        :key="`${option.role}:${option.id}`"
                        class="role-option"
                        :class="{ 'role-option--active': !roleChallenge && option.role === role }"
                        @tap="selectRole(option.role)"
                    >
                        <view class="role-option__icon">
                            <app-icon :name="option.role === 'teacher' ? 'teacher-role' : 'course-book'" size="xl" />
                        </view>
                        <view class="role-option__copy">
                            <text class="role-option__title">{{ option.role === 'teacher' ? '教师身份' : '学员身份' }}</text>
                            <text class="role-option__name">{{ option.name }}</text>
                        </view>
                        <text v-if="!roleChallenge && option.role === role" class="role-option__current">当前</text>
                    </view>
                </view>
                <view v-if="roleSelecting" class="role-popup__loading">正在切换身份</view>
            </view>
        </nut-popup>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { UserManager } from '../../../utils/usermanager';
import { Api } from '../../../utils/apis';
import AccountRow from '../../components/AccountRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import PageChrome from '../../components/PageChrome.vue';
import TicketSection from '../../components/TicketSection.vue';
import { KANYUE_INFO_LINKS, buildImageDetailUrl } from '../../data/kanyueInfoLinks';
import heroTexture from '../../imgs/textures/hero-music.png';
import { RoleManager } from '../../../utils/rolemanager';
import './index.scss';

export default {
    components: { AccountRow, AppIcon, PageChrome, TicketSection },
    data() {
        return {
            heroTexture,
            showLogin: false,
            showRolePopup: false,
            kanyueInfoLinks: KANYUE_INFO_LINKS,
            userInfo: {},
            wechatLoginLoading: false,
            wechatProfileLoading: false,
            wechatUserInfo: null,
            role: 'student',
            roleChallenge: null,
            roleOptions: [],
            roleSelecting: false,
        };
    },
    computed: {
        displayName() {
            return this.userInfo.nickName || this.userInfo.nickname || this.userInfo.realName
                || this.userInfo.cellphone || (this.role === 'teacher' ? '看乐教师' : '看乐学员');
        },
        maskedPhone() {
            const cellphone = String(this.userInfo.cellphone || '');
            if (cellphone.length < 7) return cellphone || '已登录账号';
            return `${cellphone.slice(0, 3)}****${cellphone.slice(-4)}`;
        },
        accountRoleLabel() { return this.role === 'teacher' ? '教师账号' : '学员账号'; },
        visibleRoleOptions() { return this.roleChallenge?.roles || this.roleOptions; },
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
            this.role = UserManager.getRole();
            RoleManager.applyTabBar(this.role);
            if (!UserManager.isLogin()) {
                this.roleOptions = [];
                return;
            }
            try {
                await Api.refreshLogin();
                this.userInfo = UserManager.getUserInfo();
                this.role = UserManager.getRole();
                RoleManager.applyTabBar(this.role);
            } catch {
                this.userInfo = UserManager.getUserInfo();
            }
            try { this.roleOptions = await Api.listWechatRoles(); }
            catch { this.roleOptions = []; }
        },
        goPoints() {
            Taro.switchTab({ url: '/pages/points/index' });
        },
        goCourses() {
            Taro.switchTab({ url: '/pages/courses/index' });
        },
        goBooking() {
            Taro.navigateTo({ url: '/pages/appointmentBooking/index' });
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
        openRoleSwitcher() {
            if (this.roleOptions.length > 1) this.showRolePopup = true;
        },
        closeRoleSwitcher() {
            if (this.roleChallenge || this.roleSelecting) return;
            this.showRolePopup = false;
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
                const result = await Api.loginWithWechat({
                    code: await this.ensureWechatCode(),
                    userInfo: this.wechatUserInfo,
                    phone: {
                        encryptedData: detail.encryptedData,
                        iv: detail.iv,
                    },
                });
                if (result?.requiresRoleSelection) {
                    this.roleChallenge = result;
                    this.showLogin = false;
                    this.showRolePopup = true;
                    this.resetWechatAuthState();
                    return;
                }
                this.showLogin = false;
                this.resetWechatAuthState();
                await this.refreshUserInfo();
                Taro.showToast({ title: '登录成功', icon: 'success' });
            } catch (error) {
                Taro.showToast({ title: error?.message || '登录失败，请重试', icon: 'none' });
            } finally {
                this.wechatLoginLoading = false;
            }
        },
        async selectRole(role) {
            if (this.roleSelecting || (!this.roleChallenge && role === this.role)) return;
            this.roleSelecting = true;
            try {
                if (this.roleChallenge) {
                    await Api.completeWechatRoleLogin(this.roleChallenge.challenge, role);
                } else {
                    await Api.switchWechatRole(role);
                }
                this.roleChallenge = null;
                this.showRolePopup = false;
                await this.refreshUserInfo();
                Taro.showToast({ title: role === 'teacher' ? '已切换为教师' : '已切换为学员', icon: 'success' });
            } catch (error) {
                Taro.showToast({ title: error?.message || '身份切换失败', icon: 'none' });
            } finally {
                this.roleSelecting = false;
            }
        },
    },
};
</script>
