import { lessonTotals } from './memberCards.js';

const LOGIN_MODE_OPTIONS = Object.freeze([
    { label: '微信登录', value: 'wechat' },
    { label: '手机号登录', value: 'password' },
]);

const normalizeCellphone = (value) => String(value || '').replace(/\D/g, '').slice(0, 11);

const validatePasswordLogin = ({ cellphone, password } = {}) => {
    const credentials = {
        cellphone: normalizeCellphone(cellphone),
        password: String(password || ''),
    };
    if (!/^1\d{10}$/.test(credentials.cellphone)) {
        return { credentials, error: '请输入 11 位有效手机号' };
    }
    if (!credentials.password) {
        return { credentials, error: '请输入密码' };
    }
    return { credentials, error: '' };
};

const AGREEMENT_REQUIRED_MESSAGE = '请先阅读并同意用户协议和隐私政策';

const agreementUrl = (type) => `/pages/agreement/index?type=${type === 'privacy' ? 'privacy' : 'user'}`;

// The profile is about the user: their own numbers first, each opening the page behind it.
// Unknown values (not loaded or failed) show a dash rather than a misleading zero.
function profileStats({ courses = null, points = null } = {}) {
    const totals = courses ? lessonTotals(courses) : {};
    const show = (value) => (value === null || value === undefined ? '—' : String(value));
    return [
        { key: 'remaining', label: '剩余课时', value: show(totals.remaining), url: '/pages/courses/index' },
        { key: 'scheduled', label: '待上课', value: show(totals.scheduled), url: '/pages/appointments/index' },
        { key: 'points', label: '积分', value: show(points), url: '/pages/points/index' },
    ];
}

// Account shortcuts under the cards; anything the stats already open stays out.
// The role entry has no url: the page opens the role sheet for it.
function profileEntries({ role = 'student', canSwitchRole = false } = {}) {
    return [
        role === 'student' && { key: 'orders', label: '选课订单', icon: 'course-book', url: '/pages/courseShop/index', tab: false },
        { key: 'profile', label: '个人资料', icon: 'account-profile', url: '/pages/userinfo/index', tab: false },
        canSwitchRole && { key: 'role', label: '切换身份', icon: 'teacher-role', url: '', tab: false },
    ].filter(Boolean);
}

export {
    AGREEMENT_REQUIRED_MESSAGE, LOGIN_MODE_OPTIONS, agreementUrl, normalizeCellphone, profileEntries, profileStats, validatePasswordLogin,
};
