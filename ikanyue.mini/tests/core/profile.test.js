import { describe, expect, it } from 'vitest';
import { normalizeCellphone, validatePasswordLogin } from '../../miniprogram/core/profile.js';

describe('profile login page logic', () => {
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
