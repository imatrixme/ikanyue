import { host, pageStack } from './host.js';

// Platform capabilities as plain promises. A user's own cancellation is a normal result;
// real failures reject with an Error carrying `code` and a user-facing `message`.

export function failure(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause !== undefined) error.cause = cause;
    return error;
}

const cancelled = (error) => /cancel/i.test(String(error?.errMsg || ''));

function call(name, options = {}) {
    return new Promise((resolve, reject) => {
        host[name]({ ...options, success: resolve, fail: reject });
    });
}

export function withQuery(url, query = {}) {
    const pairs = Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    if (!pairs.length) return url;
    return `${url}${url.includes('?') ? '&' : '?'}${pairs.join('&')}`;
}

function navigate(name, url) {
    return call(name, { url }).catch((error) => {
        throw failure('NAVIGATE', '页面打开失败，请稍后重试', error);
    });
}

export const nav = {
    to: (url, query) => navigate('navigateTo', withQuery(url, query)),
    redirect: (url, query) => navigate('redirectTo', withQuery(url, query)),
    tab: (url) => navigate('switchTab', url),
    relaunch: (url, query) => navigate('reLaunch', withQuery(url, query)),
    back: (delta = 1) => call('navigateBack', { delta }).catch((error) => {
        throw failure('NAVIGATE', '返回失败，请稍后重试', error);
    }),
};

export const ui = {
    toast(text, { kind = 'none', duration } = {}) {
        if (!text) return;
        host.showToast({ title: String(text), icon: kind, ...(duration ? { duration } : {}) });
    },
    async confirm({ title = '', content = '', okText, okColor, cancelText, showCancel = true } = {}) {
        const result = await call('showModal', {
            title,
            content,
            showCancel,
            ...(okText ? { confirmText: okText } : {}),
            ...(okColor ? { confirmColor: okColor } : {}),
            ...(cancelText ? { cancelText } : {}),
        });
        return Boolean(result.confirm);
    },
    loading(text = '加载中') {
        host.showLoading({ title: text, mask: true });
        let open = true;
        return () => {
            if (!open) return;
            open = false;
            host.hideLoading();
        };
    },
};

export const storage = {
    get(key) {
        try {
            const value = host.getStorageSync(key);
            return value === '' ? undefined : value;
        } catch {
            return undefined;
        }
    },
    set: (key, value) => host.setStorageSync(key, value),
    remove: (key) => host.removeStorageSync(key),
};

export async function request({ url, method = 'GET', data, headers = {}, timeout } = {}) {
    try {
        const res = await call('request', {
            url,
            method: String(method).toUpperCase(),
            data,
            header: headers,
            ...(timeout ? { timeout } : {}),
        });
        return { status: Number(res.statusCode), data: res.data, headers: res.header || {} };
    } catch (error) {
        throw failure('NETWORK', '网络连接失败，请检查网络后重试', error);
    }
}

export const auth = {
    async login() {
        const result = await call('login').catch((error) => {
            throw failure('LOGIN', '获取微信登录态失败，请稍后重试', error);
        });
        if (!result?.code) throw failure('LOGIN', '获取微信登录态失败，请稍后重试');
        return result.code;
    },
};

// Resolves 'paid' or 'cancelled'; anything else means the outcome is unknown and the order must be re-read.
export async function pay(params) {
    try {
        await call('requestPayment', params);
        return 'paid';
    } catch (error) {
        if (cancelled(error)) return 'cancelled';
        throw failure('PAY', '付款结果待确认，请查询订单', error);
    }
}

export const notify = {
    // Resolves { [templateId]: accepted }; platforms without subscribe messages resolve {}.
    async subscribe(templateIds) {
        if (typeof host.requestSubscribeMessage !== 'function') return {};
        const result = await call('requestSubscribeMessage', { tmplIds: templateIds }).catch((error) => {
            throw failure('SUBSCRIBE', '暂时无法开启微信提醒', error);
        });
        return Object.fromEntries(templateIds.map((id) => [id, result[id] === 'accept']));
    },
};

export const page = {
    title: (text) => host.setNavigationBarTitle({ title: String(text || '') }),
    stopRefresh: () => host.stopPullDownRefresh(),
    guardLeave: (message) => host.enableAlertBeforeUnload({ message }),
    unguardLeave: () => host.disableAlertBeforeUnload(),
    setTabItem: ({ index, text, iconPath, selectedIconPath }) => call('setTabBarItem', {
        index,
        ...(text ? { text } : {}),
        ...(iconPath ? { iconPath } : {}),
        ...(selectedIconPath ? { selectedIconPath } : {}),
    }),
};

export const system = {
    call: (phone) => call('makePhoneCall', { phoneNumber: String(phone) }).catch(() => {}),
    previewImage: (urls, current) => host.previewImage({ urls, current: current || urls[0] }),
    // Routes of the page stack, oldest first, e.g. ['pages/home/index', 'pages/courseShop/index'].
    currentPages: () => pageStack().map((item) => item.route),
    // Status bar and title bar heights (px) for pages with `navigationStyle: custom`;
    // the title bar centres on the capsule button, falling back to the iOS default.
    navBar: () => {
        try {
            const statusBar = (host.getWindowInfo ? host.getWindowInfo() : host.getSystemInfoSync()).statusBarHeight || 20;
            const capsule = host.getMenuButtonBoundingClientRect();
            const height = capsule?.height ? (capsule.top - statusBar) * 2 + capsule.height : 44;
            return { statusBar, height: height > 0 ? height : 44 };
        } catch {
            return { statusBar: 20, height: 44 };
        }
    },
};
