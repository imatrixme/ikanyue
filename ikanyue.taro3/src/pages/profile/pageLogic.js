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

export { LOGIN_MODE_OPTIONS, normalizeCellphone, validatePasswordLogin };
