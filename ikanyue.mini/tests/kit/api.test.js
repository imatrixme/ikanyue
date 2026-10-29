import { describe, expect, it, vi } from 'vitest';
import { auth, nav, notify, page, pay, request, storage, system, ui, withQuery } from '../../miniprogram/kit/api.js';

const fail = (errMsg) => (options) => options.fail({ errMsg });

describe('nav', () => {
    it('encodes the query and skips empty values', async () => {
        await nav.to('/pages/courseOrder/index', { id: 'a b&c', from: undefined, empty: '' });
        expect(wx.navigateTo.mock.calls[0][0].url).toBe('/pages/courseOrder/index?id=a%20b%26c');
        expect(withQuery('/p?x=1', { y: 2 })).toBe('/p?x=1&y=2');
    });

    it('turns navigation failures into coded errors', async () => {
        wx.redirectTo.mockImplementation(fail('redirectTo:fail page not found'));
        await expect(nav.redirect('/pages/missing/index')).rejects.toMatchObject({ code: 'NAVIGATE' });
    });

    it('switches tabs, goes back and relaunches', async () => {
        await nav.tab('/pages/home/index');
        await nav.back();
        await nav.relaunch('/pages/home/index', { from: 'logout' });
        expect(wx.switchTab.mock.calls[0][0].url).toBe('/pages/home/index');
        expect(wx.navigateBack.mock.calls[0][0].delta).toBe(1);
        expect(wx.reLaunch.mock.calls[0][0].url).toBe('/pages/home/index?from=logout');
    });

    it('reports a failed back navigation', async () => {
        wx.navigateBack.mockImplementation(fail('navigateBack:fail'));
        await expect(nav.back(2)).rejects.toMatchObject({ code: 'NAVIGATE' });
    });
});

describe('ui', () => {
    it('shows toasts only for real text', () => {
        ui.toast('');
        ui.toast('已保存', { kind: 'success', duration: 2600 });
        expect(wx.showToast).toHaveBeenCalledTimes(1);
        expect(wx.showToast).toHaveBeenCalledWith({ title: '已保存', icon: 'success', duration: 2600 });
    });

    it('resolves confirm to a boolean and maps button texts', async () => {
        expect(await ui.confirm({ title: '退出登录', okText: '退出', okColor: '#c62828', cancelText: '再想想' })).toBe(true);
        expect(wx.showModal.mock.calls[0][0]).toMatchObject({
            confirmText: '退出', confirmColor: '#c62828', cancelText: '再想想', showCancel: true,
        });
        wx.showModal.mockImplementation((options) => options.success({ confirm: false, cancel: true }));
        expect(await ui.confirm({ title: '退出登录', showCancel: false })).toBe(false);
        expect(wx.showModal.mock.calls[1][0].showCancel).toBe(false);
    });

    it('returns a loading closer that hides once', () => {
        const close = ui.loading('保存中');
        close();
        close();
        expect(wx.showLoading).toHaveBeenCalledWith({ title: '保存中', mask: true });
        expect(wx.hideLoading).toHaveBeenCalledTimes(1);
    });
});

describe('storage', () => {
    it('returns undefined for missing or unreadable keys', () => {
        expect(storage.get('missing')).toBeUndefined();
        storage.set('k', 'v');
        expect(storage.get('k')).toBe('v');
        storage.remove('k');
        expect(storage.get('k')).toBeUndefined();
        wx.getStorageSync.mockImplementation(() => { throw new Error('quota'); });
        expect(storage.get('k')).toBeUndefined();
    });
});

describe('request', () => {
    it('returns status, body and headers', async () => {
        wx.request.mockImplementation((options) => options.success({ statusCode: 201, data: { code: 10000 }, header: { a: '1' } }));
        const res = await request({ url: 'https://x/api', method: 'post', data: { a: 1 }, headers: { token: 't' }, timeout: 5000 });
        expect(res).toEqual({ status: 201, data: { code: 10000 }, headers: { a: '1' } });
        expect(wx.request.mock.calls[0][0]).toMatchObject({ method: 'POST', header: { token: 't' }, timeout: 5000, data: { a: 1 } });
    });

    it('rejects network failures with code NETWORK', async () => {
        wx.request.mockImplementation(fail('request:fail timeout'));
        await expect(request({ url: 'https://x/api' })).rejects.toMatchObject({ code: 'NETWORK', message: expect.stringContaining('网络') });
    });
});

describe('auth', () => {
    it('returns the login code', async () => {
        expect(await auth.login()).toBe('login-code');
    });

    it('fails when there is no code', async () => {
        wx.login.mockImplementation((options) => options.success({}));
        await expect(auth.login()).rejects.toMatchObject({ code: 'LOGIN' });
        wx.login.mockImplementation(fail('login:fail'));
        await expect(auth.login()).rejects.toMatchObject({ code: 'LOGIN' });
    });
});

describe('pay', () => {
    it('treats the user closing the cashier as a normal result', async () => {
        expect(await pay({ package: 'prepay_id=1' })).toBe('paid');
        wx.requestPayment.mockImplementation(fail('requestPayment:fail cancel'));
        expect(await pay({})).toBe('cancelled');
    });

    it('raises other failures as unknown outcome', async () => {
        wx.requestPayment.mockImplementation(fail('requestPayment:fail system error'));
        await expect(pay({})).rejects.toMatchObject({ code: 'PAY' });
    });
});

describe('notify', () => {
    it('maps the answer per template', async () => {
        wx.requestSubscribeMessage.mockImplementation((options) => options.success({ a: 'accept', b: 'reject' }));
        expect(await notify.subscribe(['a', 'b'])).toEqual({ a: true, b: false });
    });

    it('fails with a coded error and resolves {} where unsupported', async () => {
        wx.requestSubscribeMessage.mockImplementation(fail('requestSubscribeMessage:fail'));
        await expect(notify.subscribe(['a'])).rejects.toMatchObject({ code: 'SUBSCRIBE' });
        delete wx.requestSubscribeMessage;
        expect(await notify.subscribe(['a'])).toEqual({});
    });
});

describe('page and system', () => {
    it('forwards page chrome calls', async () => {
        page.title('看乐艺术');
        page.stopRefresh();
        page.guardLeave('还没保存');
        page.unguardLeave();
        await page.setTabItem({ index: 0, text: '工作台' });
        expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: '看乐艺术' });
        expect(wx.stopPullDownRefresh).toHaveBeenCalled();
        expect(wx.enableAlertBeforeUnload).toHaveBeenCalledWith({ message: '还没保存' });
        expect(wx.disableAlertBeforeUnload).toHaveBeenCalled();
        expect(wx.setTabBarItem.mock.calls[0][0]).toMatchObject({ index: 0, text: '工作台' });
    });

    it('calls, previews and lists routes', async () => {
        wx.makePhoneCall.mockImplementation(fail('makePhoneCall:fail cancel'));
        await expect(system.call(123)).resolves.toBeUndefined();
        system.previewImage(['a', 'b']);
        expect(wx.previewImage).toHaveBeenCalledWith({ urls: ['a', 'b'], current: 'a' });
        getCurrentPages.mockReturnValue([{ route: 'pages/home/index' }, { route: 'pages/courseShop/index' }]);
        expect(system.currentPages()).toEqual(['pages/home/index', 'pages/courseShop/index']);
    });

    it('measures the custom navigation bar from the capsule, with a safe fallback', () => {
        wx.getWindowInfo = vi.fn(() => ({ statusBarHeight: 47 }));
        wx.getMenuButtonBoundingClientRect = vi.fn(() => ({ top: 51, height: 32 }));
        expect(system.navBar()).toEqual({ statusBar: 47, height: 40 });
        wx.getMenuButtonBoundingClientRect = vi.fn(() => { throw new Error('unsupported'); });
        expect(system.navBar()).toEqual({ statusBar: 20, height: 44 });
    });
});
