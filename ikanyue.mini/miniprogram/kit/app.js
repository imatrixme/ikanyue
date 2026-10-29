import { ui } from './api.js';
import { registerApp } from './host.js';

// Errors that carry a code were written for users (API envelope, network, payment); anything else is a bug.
export function errorText(error) {
    if (error && error.code !== undefined && error.message) return error.message;
    return '操作失败，请稍后重试';
}

// Async lifecycles and event handlers return promises the framework ignores;
// their uncaught rejections all land here and become one toast.
export function defineApp(options = {}) {
    const definition = {
        ...options,
        onUnhandledRejection(event) {
            const error = event?.reason;
            if (!(error && error.code !== undefined)) console.error(error);
            ui.toast(errorText(error));
            if (options.onUnhandledRejection) options.onUnhandledRejection.call(this, event);
        },
    };
    registerApp(definition);
    return definition;
}
