import { beforeEach, vi } from 'vitest';

// A stand-in for the WeChat runtime: callback APIs succeed by default; tests override per case.
const succeed = (result = {}) => vi.fn((options = {}) => options.success?.({ errMsg: 'ok', ...result }));

function createHost() {
    const store = new Map();
    return {
        getAccountInfoSync: vi.fn(() => ({ miniProgram: { envVersion: 'develop' } })),
        getStorageSync: vi.fn((key) => (store.has(key) ? store.get(key) : '')),
        setStorageSync: vi.fn((key, value) => { store.set(key, value); }),
        removeStorageSync: vi.fn((key) => { store.delete(key); }),
        request: succeed({ statusCode: 200, data: {}, header: {} }),
        navigateTo: succeed(),
        redirectTo: succeed(),
        switchTab: succeed(),
        reLaunch: succeed(),
        navigateBack: succeed(),
        showToast: vi.fn(),
        showModal: succeed({ confirm: true, cancel: false }),
        showLoading: vi.fn(),
        hideLoading: vi.fn(),
        login: succeed({ code: 'login-code' }),
        requestPayment: succeed(),
        requestSubscribeMessage: succeed(),
        setNavigationBarTitle: vi.fn(),
        stopPullDownRefresh: vi.fn(),
        enableAlertBeforeUnload: vi.fn(),
        disableAlertBeforeUnload: vi.fn(),
        setTabBarItem: succeed(),
        makePhoneCall: succeed(),
        previewImage: vi.fn(),
    };
}

globalThis.wx = createHost();
globalThis.App = vi.fn();
globalThis.Page = vi.fn();
globalThis.Component = vi.fn();
globalThis.getCurrentPages = vi.fn(() => []);

// Modules keep the original object (kit/host.js binds it once), so reset its members in place.
beforeEach(() => {
    Object.assign(globalThis.wx, createHost());
    globalThis.App.mockClear();
    globalThis.Page.mockClear();
    globalThis.Component.mockClear();
    globalThis.getCurrentPages.mockReset().mockReturnValue([]);
});
