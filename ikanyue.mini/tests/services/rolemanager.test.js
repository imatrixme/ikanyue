import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleManager, STUDENT_TABS, TEACHER_TABS } from '../../miniprogram/services/rolemanager.js';

const userManagerMock = vi.hoisted(() => ({ getRole: vi.fn() }));

vi.mock('../../miniprogram/services/usermanager.js', () => ({ UserManager: userManagerMock }));

describe('RoleManager', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.clearAllMocks();
        wx.setTabBarItem.mockImplementation((options) => options.success({}));
    });

    afterEach(() => vi.restoreAllMocks());

    it('projects student and teacher roles into stable tab labels and generated assets', async () => {
        userManagerMock.getRole.mockReturnValue('teacher');
        expect(RoleManager.getRole()).toBe('teacher');
        expect(RoleManager.isTeacher()).toBe(true);
        await expect(RoleManager.applyTabBar()).resolves.toBe(true);
        expect(wx.setTabBarItem.mock.calls.map(([item]) => item)).toMatchObject(TEACHER_TABS);
        expect(TEACHER_TABS.map((tab) => tab.text)).toEqual(['工作台', '日历']);

        wx.setTabBarItem.mockClear();
        await RoleManager.applyTabBar('student');
        expect(wx.setTabBarItem.mock.calls.map(([item]) => item)).toMatchObject(STUDENT_TABS);
        expect(STUDENT_TABS.map((tab) => tab.text)).toEqual(['首页', '约课']);
        // setTabBarItem resolves relative paths against the current page, so icons must be root-absolute.
        for (const tab of [...STUDENT_TABS, ...TEACHER_TABS]) {
            expect(tab.iconPath).toMatch(/^\/imgs\/icons\/.+\.png$/);
            expect(tab.selectedIconPath).toMatch(/^\/imgs\/icons\/.+\.png$/);
        }
    });

    it('degrades safely when the platform API is absent or rejects an update', async () => {
        const original = wx.setTabBarItem;
        wx.setTabBarItem = undefined;
        await expect(RoleManager.applyTabBar('teacher')).resolves.toBe(false);
        wx.setTabBarItem = vi.fn((options) => options.fail({ errMsg: 'setTabBarItem:fail unsupported' }));
        await expect(RoleManager.applyTabBar('teacher')).resolves.toBe(false);
        wx.setTabBarItem = original;
    });
});
