import { page as pageApi } from './api.js';
import { registerPage } from './host.js';
import { initialData, stateMethods } from './state.js';

function decode(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function decodeQuery(query) {
    return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, typeof value === 'string' ? decode(value) : value]));
}

// definePage({ data: () => ({}), computed: { name: (data) => value }, onLoad() {}, methods: {} })
// Lifecycles pass through unchanged; methods are flattened onto the page.
// onLoad receives the query already decoded (the platform passes values as written in the URL).
// A promise returned by onPullDownRefresh stops the refresh indicator when it settles.
export function definePage({ data, computed = {}, methods = {}, ...hooks } = {}) {
    const options = {
        ...hooks,
        ...methods,
        ...stateMethods(computed),
        data: initialData(data, computed),
    };
    if (typeof hooks.onLoad === 'function') {
        options.onLoad = function onLoad(query = {}) {
            return hooks.onLoad.call(this, decodeQuery(query));
        };
    }
    if (typeof hooks.onPullDownRefresh === 'function') {
        options.onPullDownRefresh = function onPullDownRefresh(...args) {
            return Promise.resolve()
                .then(() => hooks.onPullDownRefresh.apply(this, args))
                .finally(() => pageApi.stopRefresh());
        };
    }
    registerPage(options);
    return options;
}
