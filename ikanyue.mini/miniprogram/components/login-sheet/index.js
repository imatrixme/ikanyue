import { defineComponent } from '../../kit/component.js';
import { auth, nav, ui } from '../../kit/api.js';
import {
    AGREEMENT_REQUIRED_MESSAGE, agreementUrl, normalizeCellphone, validatePasswordLogin,
} from '../../core/profile.js';
import { Api } from '../../services/apis.js';
import { UserManager } from '../../services/usermanager.js';

// The sign-in sheet any page opens when the user does something that needs an account; the page
// reloads in place on success. A WeChat phone with both a student and a teacher identity picks one first.
// <login-sheet visible="{{showLogin}}" bind:close="…" bind:success="…" />
const IDLE = Object.freeze({
    passwordCellphone: '', passwordValue: '', passwordLoginLoading: false, wechatLoginLoading: false,
    roleChallenge: null, roleSelecting: false,
});

defineComponent({
    props: {
        visible: { type: Boolean, value: false },
    },
    data: () => ({ loginMode: 'wechat', agreed: false, ...IDLE }),
    computed: {
        roleRows: (d) => (d.roleChallenge?.roles || []).map((option) => ({
            key: `${option.role}:${option.id}`,
            role: option.role,
            name: option.name,
            icon: option.role === 'teacher' ? 'teacher-role' : 'course-book',
            title: option.role === 'teacher' ? '教师身份' : '学员身份',
        })),
    },
    methods: {
        // Typed passwords never outlive the sheet; the agreement tick does.
        close() {
            if (this.data.roleSelecting) return;
            this.set({ ...IDLE });
            this.emit('close');
        },
        switchLoginMode() {
            this.set({ loginMode: this.data.loginMode === 'wechat' ? 'password' : 'wechat' });
        },
        toggleAgreed() {
            this.set({ agreed: !this.data.agreed });
        },
        requireAgreement() {
            ui.toast(AGREEMENT_REQUIRED_MESSAGE);
        },
        openAgreement(event) {
            nav.to(agreementUrl(event.currentTarget.dataset.type));
        },
        handlePasswordCellphoneInput(event) {
            this.set({ passwordCellphone: normalizeCellphone(event.detail.value) });
        },
        async handlePasswordLogin() {
            if (this.data.passwordLoginLoading) return;
            if (!this.data.agreed) {
                this.requireAgreement();
                return;
            }
            const { credentials, error } = validatePasswordLogin({
                cellphone: this.data.passwordCellphone,
                password: this.data.passwordValue,
            });
            if (error) {
                ui.toast(error);
                return;
            }
            await this.set({ passwordLoginLoading: true });
            try {
                await Api.loginWithPassword(credentials.cellphone, credentials.password);
                await this.succeed();
            } catch (loginError) {
                ui.toast(loginError?.message || '登录失败，请重试');
            } finally {
                await this.set({ passwordLoginLoading: false });
            }
        },
        async handleWechatPhone(event) {
            if (this.data.wechatLoginLoading) return;
            const detail = event.detail || {};
            if (detail.errMsg !== 'getPhoneNumber:ok') {
                ui.toast('未获取到手机号');
                return;
            }
            if (!detail.encryptedData || !detail.iv) {
                ui.toast('微信未返回手机号信息');
                return;
            }
            await this.set({ wechatLoginLoading: true });
            try {
                const result = await Api.loginWithWechat({
                    code: await auth.login(),
                    phone: { encryptedData: detail.encryptedData, iv: detail.iv },
                });
                if (result?.requiresRoleSelection) {
                    await this.set({ roleChallenge: result });
                    return;
                }
                await this.succeed();
            } catch (error) {
                ui.toast(error?.message || '登录失败，请重试');
            } finally {
                await this.set({ wechatLoginLoading: false });
            }
        },
        async selectRole(event) {
            const { role } = event.currentTarget.dataset;
            const { roleChallenge, roleSelecting } = this.data;
            if (roleSelecting || !roleChallenge) return;
            await this.set({ roleSelecting: true });
            try {
                await Api.completeWechatRoleLogin(roleChallenge.challenge, role);
                await this.set({ roleSelecting: false });
                await this.succeed();
            } catch (error) {
                ui.toast(error?.message || '身份选择失败，请重新登录');
                await this.set({ roleSelecting: false, roleChallenge: null });
            }
        },
        async succeed() {
            await this.set({ ...IDLE });
            ui.toast('登录成功', { kind: 'success' });
            this.emit('success', { role: UserManager.getRole() });
        },
    },
});
