import { lessonTotals } from './memberCards.js';

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
// `account` entries need a signed-in user; a guest signs in on the spot when tapping one.
function profileEntries({ role = 'student', canSwitchRole = false } = {}) {
    const student = role === 'student';
    return [
        student && { key: 'orders', label: '我的订单', icon: 'course-book', url: '/pages/courseShop/index', tab: false, account: true },
        student && { key: 'records', label: '课时记录', icon: 'course-history', url: '/pages/courseRecords/index', tab: false, account: true },
        { key: 'profile', label: '个人资料', icon: 'account-profile', url: '/pages/userinfo/index', tab: false, account: true },
        { key: 'agreement', label: '用户协议', icon: 'account-about', url: agreementUrl('user'), tab: false, account: false },
        canSwitchRole && { key: 'role', label: '切换身份', icon: 'teacher-role', url: '', tab: false, account: true },
    ].filter(Boolean);
}

// The profile header greets by the hour of the day, like a front desk would.
function greeting(hour) {
    if (hour < 5) return '晚上好';
    if (hour < 11) return '早上好';
    if (hour < 13) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
}

export {
    AGREEMENT_REQUIRED_MESSAGE, agreementUrl, greeting, normalizeCellphone, profileEntries, profileStats, validatePasswordLogin,
};
