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

export {
    AGREEMENT_REQUIRED_MESSAGE, LOGIN_MODE_OPTIONS, agreementUrl, normalizeCellphone, validatePasswordLogin,
};
