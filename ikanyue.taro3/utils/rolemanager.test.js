import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleManager, STUDENT_TABS, TEACHER_TABS } from './rolemanager';

const taroMock = vi.hoisted(() => ({ setTabBarItem: vi.fn() }));
const userManagerMock = vi.hoisted(() => ({ getRole: vi.fn() }));

vi.mock('@tarojs/taro', () => ({ default: taroMock }));
vi.mock('./usermanager', () => ({ UserManager: userManagerMock }));

describe('RoleManager', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.clearAllMocks();
        taroMock.setTabBarItem.mockResolvedValue({});
    });

    afterEach(() => vi.restoreAllMocks());

    it('projects student and teacher roles into stable tab labels and generated assets', async () => {
        userManagerMock.getRole.mockReturnValue('teacher');
        expect(RoleManager.getRole()).toBe('teacher');
        expect(RoleManager.isTeacher()).toBe(true);
        await expect(RoleManager.applyTabBar()).resolves.toBe(true);
        expect(taroMock.setTabBarItem.mock.calls.map(([item]) => item)).toEqual(TEACHER_TABS);
        expect(TEACHER_TABS.map((tab) => tab.text)).toEqual(['工作台', '日历']);

        taroMock.setTabBarItem.mockClear();
        await RoleManager.applyTabBar('student');
        expect(taroMock.setTabBarItem.mock.calls.map(([item]) => item)).toEqual(STUDENT_TABS);
        expect(STUDENT_TABS.map((tab) => tab.text)).toEqual(['首页', '约课']);
    });

    it('degrades safely when the platform API is absent or rejects an update', async () => {
        const original = taroMock.setTabBarItem;
        taroMock.setTabBarItem = undefined;
        await expect(RoleManager.applyTabBar('teacher')).resolves.toBe(false);
        taroMock.setTabBarItem = vi.fn().mockRejectedValue(new Error('unsupported'));
        await expect(RoleManager.applyTabBar('teacher')).resolves.toBe(false);
        taroMock.setTabBarItem = original;
    });
});
