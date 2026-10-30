import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginGate } from '../../miniprogram/services/loginGate.js';
import { mount } from '../kit/mount.js';

const userManagerMock = vi.hoisted(() => ({ isLogin: vi.fn(() => false), getRole: vi.fn(() => 'student') }));
const apiMock = vi.hoisted(() => ({ loginWithPassword: vi.fn(), loginWithWechat: vi.fn(), completeWechatRoleLogin: vi.fn() }));

vi.mock('../../miniprogram/services/usermanager.js', () => ({ UserManager: userManagerMock }));
vi.mock('../../miniprogram/services/apis.js', () => ({ Api: apiMock }));

const page = () => {
    const instance = mount({ data: { showLogin: false }, methods: loginGate, onShow: vi.fn() });
    instance.set = function set(patch) {
        Object.assign(this.data, patch);
        return Promise.resolve();
    };
    return instance;
};

// The component registers once on first import; keep its definition for later cases.
let definition;
async function loginSheet() {
    if (!definition) {
        await import('../../miniprogram/components/login-sheet/index.js');
        definition = Component.mock.calls.at(-1)[0];
    }
    const sheet = mount(definition);
    sheet.set = function set(patch) {
        Object.assign(this.data, patch);
        return Promise.resolve();
    };
    return sheet;
}

beforeEach(() => {
    vi.clearAllMocks();
    userManagerMock.isLogin.mockReturnValue(false);
    userManagerMock.getRole.mockReturnValue('student');
});

describe('loginGate', () => {
    it('runs the action at once when signed in', async () => {
        userManagerMock.isLogin.mockReturnValue(true);
        const action = vi.fn();
        const target = page();
        await target.withAccount(action);
        expect(action).toHaveBeenCalledOnce();
        expect(target.data.showLogin).toBe(false);
    });

    it('signs a guest in on the page, reloads it and continues the action', async () => {
        const action = vi.fn();
        const target = page();
        await target.withAccount(action);
        expect([target.data.showLogin, action.mock.calls.length]).toEqual([true, 0]);
        await target.handleLoginSuccess();
        expect(target.data.showLogin).toBe(false);
        expect(target.onShow).toHaveBeenCalledOnce();
        expect(action).toHaveBeenCalledOnce();
    });

    it('drops the action when the sheet closes, and for a teacher who lands on the workbench', async () => {
        const action = vi.fn();
        const target = page();
        await target.withAccount(action);
        await target.closeLogin();
        await target.handleLoginSuccess();
        expect(action).not.toHaveBeenCalled();

        userManagerMock.getRole.mockReturnValue('teacher');
        await target.withAccount(action);
        await target.handleLoginSuccess();
        expect(target.onShow).toHaveBeenCalledTimes(2);
        expect(action).not.toHaveBeenCalled();
    });
});

describe('login-sheet', () => {
    it('asks for the agreement, then signs in with a password and reports success', async () => {
        const sheet = await loginSheet();
        Object.assign(sheet.data, { passwordCellphone: '13800000000', passwordValue: 'secret' });
        await sheet.handlePasswordLogin();
        expect(apiMock.loginWithPassword).not.toHaveBeenCalled();
        expect(wx.showToast).toHaveBeenLastCalledWith(expect.objectContaining({ title: '请先阅读并同意用户协议和隐私政策' }));

        await sheet.toggleAgreed();
        Object.assign(sheet.data, { passwordCellphone: '13800000000', passwordValue: 'secret' });
        await sheet.handlePasswordLogin();
        expect(apiMock.loginWithPassword).toHaveBeenCalledWith('13800000000', 'secret');
        expect(sheet.data).toMatchObject({ passwordValue: '', passwordCellphone: '', agreed: true });
        expect(sheet.triggerEvent).toHaveBeenCalledWith('success', { role: 'student' });
    });

    it('lets a WeChat phone with two identities pick one before succeeding', async () => {
        const sheet = await loginSheet();
        const roles = [{ role: 'student', id: 's1', name: '林同学' }, { role: 'teacher', id: 't1', name: '王老师' }];
        apiMock.loginWithWechat.mockResolvedValue({ requiresRoleSelection: true, challenge: 'c1', roles });
        await sheet.handleWechatPhone({ detail: { errMsg: 'getPhoneNumber:ok', encryptedData: 'e', iv: 'i' } });
        expect(sheet.data.roleChallenge).toMatchObject({ challenge: 'c1' });
        expect(sheet.triggerEvent).not.toHaveBeenCalled();

        userManagerMock.getRole.mockReturnValue('teacher');
        await sheet.selectRole({ currentTarget: { dataset: { role: 'teacher' } } });
        expect(apiMock.completeWechatRoleLogin).toHaveBeenCalledWith('c1', 'teacher');
        expect(sheet.data.roleChallenge).toBe(null);
        expect(sheet.triggerEvent).toHaveBeenCalledWith('success', { role: 'teacher' });
    });

    it('closes without keeping typed credentials', async () => {
        const sheet = await loginSheet();
        Object.assign(sheet.data, { passwordCellphone: '13800000000', passwordValue: 'secret' });
        sheet.close();
        expect(sheet.data).toMatchObject({ passwordCellphone: '', passwordValue: '' });
        expect(sheet.triggerEvent).toHaveBeenCalledWith('close', undefined);
    });
});
