import Taro from '@tarojs/taro';
import { UserManager } from './usermanager';

const STUDENT_TABS = Object.freeze([
    {
        index: 0,
        text: '首页',
        iconPath: 'imgs/icons/tab-home.png',
        selectedIconPath: 'imgs/icons/tab-home-selected.png',
    },
    {
        index: 1,
        text: '约课',
        iconPath: 'imgs/icons/tab-booking.png',
        selectedIconPath: 'imgs/icons/tab-booking-selected.png',
    },
]);

const TEACHER_TABS = Object.freeze([
    {
        index: 0,
        text: '工作台',
        iconPath: 'imgs/icons/tab-workbench.png',
        selectedIconPath: 'imgs/icons/tab-workbench-selected.png',
    },
    {
        index: 1,
        text: '日历',
        iconPath: 'imgs/icons/tab-booking.png',
        selectedIconPath: 'imgs/icons/tab-booking-selected.png',
    },
]);

const getRole = () => UserManager.getRole();

const isTeacher = () => getRole() === 'teacher';

const applyTabBar = async (role = getRole()) => {
    if (typeof Taro.setTabBarItem !== 'function') return false;
    const tabs = role === 'teacher' ? TEACHER_TABS : STUDENT_TABS;
    try {
        await Promise.all(tabs.map((tab) => Taro.setTabBarItem(tab)));
        return true;
    } catch (error) {
        console.warn('更新角色导航失败:', error);
        return false;
    }
};

const RoleManager = { applyTabBar, getRole, isTeacher };

export { RoleManager, STUDENT_TABS, TEACHER_TABS };
