import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import {
    GENDER_OPTIONS, PROVINCE_OPTIONS, buildUserUpdatePayload, hydrateUserInfoForm,
    persistUserInfoUpdate, validateUserUpdatePayload,
} from '../../core/userinfo.js';
import { Api } from '../../services/apis.js';
import { UserManager } from '../../services/usermanager.js';

definePage({
    data: () => ({
        avatarUrl: '', form: hydrateUserInfoForm(), genderOptions: GENDER_OPTIONS, provinceOptions: PROVINCE_OPTIONS, saving: false,
    }),
    computed: {
        displayInitial: (d) => (d.form.nickName || d.form.realName || '看').slice(0, 1),
        provinceIndex: (d) => Math.max(0, d.provinceOptions.indexOf(d.form.province || '未设置')),
        maskedPhone: (d) => {
            const cellphone = String(d.form.cellphone || '');
            if (cellphone.length < 7) return cellphone || '未提供';
            return `${cellphone.slice(0, 3)}****${cellphone.slice(-4)}`;
        },
    },
    onShow() {
        this.refreshForm();
    },
    async onPullDownRefresh() {
        try {
            if (UserManager.isLogin()) await Api.refreshLogin();
            this.refreshForm();
        } catch (error) {
            ui.toast(error?.message || '资料刷新失败');
        }
    },
    methods: {
        refreshForm() {
            if (!UserManager.isLogin()) {
                nav.tab('/pages/profile/index');
                return;
            }
            const userInfo = UserManager.getUserInfo();
            this.set({ form: hydrateUserInfoForm(userInfo), avatarUrl: userInfo.avatarUrl || userInfo.avatar || '' });
        },
        changeGender(event) {
            this.set({ form: { ...this.data.form, gender: event.detail.value } });
        },
        handleProvinceChange(event) {
            const province = this.data.provinceOptions[Number(event.detail.value || 0)] || '';
            this.set({ form: { ...this.data.form, province: province === '未设置' ? '' : province } });
        },
        async saveInfo() {
            if (this.data.saving) return;
            const payload = buildUserUpdatePayload(this.data.form);
            const validationMessage = validateUserUpdatePayload(payload);
            if (validationMessage) {
                ui.toast(validationMessage);
                return;
            }
            await this.set({ saving: true });
            const closeLoading = ui.loading('保存中');
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
                await this.set({ saving: false });
                closeLoading();
            }
            if (saved) ui.toast('资料已更新', { kind: 'success' });
            else ui.toast(saveError);
        },
        async confirmLogout() {
            const confirmed = await ui.confirm({
                title: '确定退出登录？',
                content: '保持登录可以随时查看课时和预约，退出后需要重新验证手机号。',
                cancelText: '保持登录',
                okText: '退出',
            });
            if (!confirmed) return;
            UserManager.logout();
            ui.toast('已退出');
            setTimeout(() => nav.tab('/pages/profile/index'), 300);
        },
    },
});
