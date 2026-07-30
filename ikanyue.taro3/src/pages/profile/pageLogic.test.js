import { describe, expect, it } from 'vitest';
import { LOGIN_MODE_OPTIONS, normalizeCellphone, validatePasswordLogin } from './pageLogic';

describe('profile login page logic', () => {
    it('offers both WeChat and password login modes', () => {
        expect(LOGIN_MODE_OPTIONS).toEqual([
            { label: '微信登录', value: 'wechat' },
            { label: '手机号登录', value: 'password' },
        ]);
    });

    it('normalizes cellphone input to eleven digits', () => {
        expect(normalizeCellphone('138 0000-0001 extra')).toBe('13800000001');
        expect(normalizeCellphone(null)).toBe('');
    });

    it('validates cellphone and password before calling the login API', () => {
        expect(validatePasswordLogin({ cellphone: '1380000', password: 'secret' }).error).toContain('有效手机号');
        expect(validatePasswordLogin({ cellphone: '13800000001', password: '' }).error).toBe('请输入密码');
        expect(validatePasswordLogin({ cellphone: ' 13800000001 ', password: 'admin870329' })).toEqual({
            credentials: { cellphone: '13800000001', password: 'admin870329' },
            error: '',
        });
    });
});
