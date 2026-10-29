import { describe, expect, it, vi } from 'vitest';
import { failure } from '../../miniprogram/kit/api.js';
import { defineApp, errorText } from '../../miniprogram/kit/app.js';

describe('defineApp', () => {
    it('turns uncaught async errors into one toast', () => {
        const own = vi.fn();
        const app = defineApp({ onUnhandledRejection: own });
        expect(App).toHaveBeenCalledWith(app);
        app.onUnhandledRejection({ reason: failure('NETWORK', '网络连接失败，请检查网络后重试') });
        expect(wx.showToast).toHaveBeenCalledWith({ title: '网络连接失败，请检查网络后重试', icon: 'none' });
        expect(own).toHaveBeenCalledTimes(1);
    });

    it('hides programming errors behind a generic message', () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = defineApp();
        app.onUnhandledRejection({ reason: new TypeError('x is undefined') });
        expect(wx.showToast).toHaveBeenCalledWith({ title: '操作失败，请稍后重试', icon: 'none' });
        expect(log).toHaveBeenCalled();
        expect(errorText(undefined)).toBe('操作失败，请稍后重试');
        log.mockRestore();
    });
});
