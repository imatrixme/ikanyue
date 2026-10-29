import { describe, expect, it, vi } from 'vitest';
import {
    GENDER_OPTIONS,
    PROVINCE_OPTIONS,
    buildUserUpdatePayload,
    hydrateUserInfoForm,
    persistUserInfoUpdate,
    validateUserUpdatePayload,
} from '../../miniprogram/core/userinfo.js';

describe('userinfo page logic', () => {
    it('hydrates both current camel-case and legacy lower-case user fields', () => {
        expect(
            hydrateUserInfoForm({
                nickName: '小陈',
                realName: '陈同学',
                cellphone: '13800000001',
                gender: 2,
                age: 12,
                province: '上海市',
            })
        ).toEqual({
            nickName: '小陈',
            realName: '陈同学',
            cellphone: '13800000001',
            gender: 2,
            age: 12,
            province: '上海市',
        });
        expect(hydrateUserInfoForm({ nickname: '旧昵称', realname: '旧姓名' })).toMatchObject({
            nickName: '旧昵称',
            realName: '旧姓名',
            age: 18,
        });
    });

    it('builds the lightweight profile payload and trims text', () => {
        expect(
            buildUserUpdatePayload({ nickName: ' 小陈 ', realName: ' 陈同学 ', gender: '1', age: '16', province: ' 江苏省 ' })
        ).toEqual({
            nickName: '小陈',
            realName: '陈同学',
            gender: 1,
            age: 16,
            province: '江苏省',
        });
    });

    it('validates required fields and the gender option', () => {
        expect(validateUserUpdatePayload({ nickName: '', realName: '陈同学', gender: 0, age: 12 })).toBe('请输入昵称');
        expect(validateUserUpdatePayload({ nickName: '小陈', realName: '', gender: 0, age: 12 })).toBe('请输入姓名');
        expect(validateUserUpdatePayload({ nickName: '小陈', realName: '陈同学', gender: 0, age: 0 })).toContain('有效年龄');
        expect(validateUserUpdatePayload({ nickName: '小陈', realName: '陈同学', gender: 9, age: 12 })).toBe('请选择有效性别');
        expect(validateUserUpdatePayload({ nickName: '小陈', realName: '陈同学', gender: 0, age: 12 })).toBe('');
        expect(GENDER_OPTIONS).toHaveLength(3);
        expect(PROVINCE_OPTIONS).toContain('广东省');
    });

    it('keeps a successful profile update successful when session refresh fails', async () => {
        const payload = { nickName: '小陈', realName: '陈同学', gender: 2, age: 12, province: '上海市' };
        const updateUserInfo = vi.fn().mockResolvedValue({ id: 'student_1', ...payload });
        const refreshLogin = vi.fn().mockRejectedValue(new Error('refresh failed'));

        await expect(persistUserInfoUpdate({ payload, refreshLogin, updateUserInfo })).resolves.toMatchObject(payload);
        expect(updateUserInfo).toHaveBeenCalledWith(payload);
        expect(refreshLogin).toHaveBeenCalledOnce();
    });
});
