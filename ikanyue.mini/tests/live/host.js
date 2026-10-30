import { request as httpRequest } from 'node:http';

// A live stand-in for the WeChat runtime: requests really go to the local stack through the API gateway,
// as the mapi.ikanyue.com group in the TEST stage. Dialogs accept, subscribe prompts accept, and every
// toast and navigation is recorded so flows can assert what a user would have seen.
const gateway = new URL(process.env.LIVE_GATEWAY_URL || 'http://127.0.0.1:1460');
const server = new URL(process.env.LIVE_SERVER_URL || 'http://127.0.0.1:1437');
const apiHost = process.env.LIVE_API_HOST || 'mapi.ikanyue.com';
// Development-only routes the gateway never exposes (see scripts/gateway-exposure.test.mjs) go straight to the server.
const developmentOnly = /\/v1\/student\/commerce\/orders\/[^/]+\/mock-pay$/;

const store = new Map([['kit.devApiUrl', gateway.origin]]);
const log = { toasts: [], navigations: [], modals: [], requests: [], subscribes: [] };
let pending = 0;

function send({ url, method = 'GET', data, header = {} }) {
    const target = new URL(url);
    const direct = developmentOnly.test(target.pathname);
    const origin = direct ? server : gateway;
    let body;
    if (method === 'GET' && data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
    } else if (data !== undefined) {
        body = typeof data === 'string' ? data : JSON.stringify(data);
    }
    const headers = { ...header, host: direct ? server.host : apiHost };
    if (body !== undefined) headers['content-length'] = Buffer.byteLength(body);
    return new Promise((resolve, reject) => {
        const req = httpRequest({
            hostname: origin.hostname, port: origin.port, method, path: `${target.pathname}${target.search}`, headers,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let parsed = text;
                try { parsed = JSON.parse(text); } catch { /* non-JSON bodies stay text, as on the device */ }
                log.requests.push({ method, path: target.pathname, status: res.statusCode, direct });
                resolve({ statusCode: res.statusCode, data: parsed, header: res.headers, errMsg: 'request:ok' });
            });
        });
        req.on('error', (error) => reject({ errMsg: `request:fail ${error.message}` }));
        req.setTimeout(15000, () => req.destroy(new Error('timeout')));
        if (body !== undefined) req.write(body);
        req.end();
    });
}

const ok = (result = {}) => (options = {}) => options.success?.({ errMsg: 'ok', ...result });
const navigation = (type) => (options = {}) => {
    log.navigations.push({ type, url: options.url ?? options.delta });
    options.success?.({ errMsg: `${type}:ok` });
};

globalThis.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    getStorageSync: (key) => (store.has(key) ? store.get(key) : ''),
    setStorageSync: (key, value) => { store.set(key, value); },
    removeStorageSync: (key) => { store.delete(key); },
    request(options) {
        pending += 1;
        send(options).then(options.success, options.fail).finally(() => { pending -= 1; });
    },
    navigateTo: navigation('navigateTo'),
    redirectTo: navigation('redirectTo'),
    switchTab: navigation('switchTab'),
    reLaunch: navigation('reLaunch'),
    navigateBack: navigation('navigateBack'),
    showToast: (options) => { log.toasts.push(options.title); },
    showModal: (options = {}) => {
        log.modals.push(options.title);
        options.success?.({ errMsg: 'showModal:ok', confirm: true, cancel: false });
    },
    showLoading: () => {},
    hideLoading: () => {},
    login: ok({ code: 'live-login-code' }),
    requestPayment: (options = {}) => options.fail?.({ errMsg: 'requestPayment:fail live harness has no cashier' }),
    requestSubscribeMessage: (options = {}) => {
        log.subscribes.push(options.tmplIds);
        options.success?.({ errMsg: 'requestSubscribeMessage:ok', ...Object.fromEntries(options.tmplIds.map((id) => [id, 'accept'])) });
    },
    setNavigationBarTitle: () => {},
    stopPullDownRefresh: () => {},
    enableAlertBeforeUnload: () => {},
    disableAlertBeforeUnload: () => {},
    setTabBarItem: ok(),
    makePhoneCall: ok(),
    previewImage: () => {},
    getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
};

const registered = [];
const components = [];
globalThis.App = () => {};
globalThis.Page = (options) => { registered.push(options); };
globalThis.Component = (options) => { components.push(options); };
globalThis.getCurrentPages = () => [];

// Waits until no request is in flight and the page has stopped scheduling work.
export async function settle() {
    let quiet = 0;
    while (quiet < 3) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        quiet = pending ? 0 : quiet + 1;
    }
}

const root = new URL('../../miniprogram/', import.meta.url).pathname;

// Opens a page the way the runtime does: own data, setData merging top-level keys, onLoad then onShow.
export async function open(path, query = {}) {
    const before = registered.length;
    await import(`${root}${path}/index.js`);
    const options = registered.length > before ? registered.at(-1) : open.cache.get(path);
    open.cache.set(path, options);
    const page = { ...options, data: structuredClone(options.data), selectComponent: () => null, route: path };
    page.setData = function setData(patch, callback) {
        Object.assign(this.data, structuredClone(patch));
        callback?.();
    };
    await page.onLoad?.(query);
    await page.onShow?.();
    await settle();
    return page;
}
open.cache = new Map();

// Mounts a component on its own, like open(): created then attached; child components are absent.
export async function mount(path) {
    const before = components.length;
    await import(`${root}${path}/index.js`);
    const options = components.length > before ? components.at(-1) : mount.cache.get(path);
    mount.cache.set(path, options);
    const instance = { ...options.methods, data: structuredClone(options.data), selectComponent: () => null };
    instance.setData = function setData(patch, callback) {
        Object.assign(this.data, structuredClone(patch));
        callback?.();
    };
    options.lifetimes?.created?.call(instance);
    await options.lifetimes?.attached?.call(instance);
    await settle();
    return instance;
}
mount.cache = new Map();

export const tap = (dataset = {}, detail = {}) => ({ currentTarget: { dataset }, detail });

export async function act(result) {
    await result;
    await settle();
}

export { log };
