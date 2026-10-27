const GENDER_OPTIONS = [
    { label: '未设置', value: 0 },
    { label: '男', value: 1 },
    { label: '女', value: 2 },
];

const PROVINCE_OPTIONS = [
    '未设置',
    '安徽省',
    '澳门特别行政区',
    '北京市',
    '重庆市',
    '福建省',
    '甘肃省',
    '广东省',
    '广西壮族自治区',
    '贵州省',
    '海南省',
    '河北省',
    '河南省',
    '黑龙江省',
    '湖北省',
    '湖南省',
    '吉林省',
    '江苏省',
    '江西省',
    '辽宁省',
    '内蒙古自治区',
    '宁夏回族自治区',
    '青海省',
    '山东省',
    '山西省',
    '陕西省',
    '上海市',
    '四川省',
    '台湾省',
    '天津市',
    '香港特别行政区',
    '新疆维吾尔自治区',
    '西藏自治区',
    '云南省',
    '浙江省',
];

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

const hydrateUserInfoForm = (userInfo = {}) => ({
    age: Number(userInfo.age) > 0 ? Number(userInfo.age) : 18,
    cellphone: String(firstDefined(userInfo.cellphone, '') || ''),
    gender: Number(firstDefined(userInfo.gender, 0)),
    nickName: String(firstDefined(userInfo.nickName, userInfo.nickname, '') || ''),
    province: String(firstDefined(userInfo.province, '') || ''),
    realName: String(firstDefined(userInfo.realName, userInfo.realname, '') || ''),
});

const buildUserUpdatePayload = (formState = {}) => ({
    age: Number(formState.age),
    gender: Number(formState.gender || 0),
    nickName: String(formState.nickName || '').trim(),
    province: String(formState.province || '').trim(),
    realName: String(formState.realName || '').trim(),
});

const validateUserUpdatePayload = (payload) => {
    if (!payload.nickName) {
        return '请输入昵称';
    }
    if (!payload.realName) {
        return '请输入姓名';
    }
    if (!Number.isInteger(payload.age) || payload.age < 1 || payload.age > 120) {
        return '请输入 1-120 岁的有效年龄';
    }
    if (!GENDER_OPTIONS.some((option) => option.value === payload.gender)) {
        return '请选择有效性别';
    }
    return '';
};

const persistUserInfoUpdate = async ({ payload, refreshLogin, updateUserInfo }) => {
    const result = await updateUserInfo(payload);
    try {
        await refreshLogin();
    } catch {
        // The update response is authoritative; refresh only reconciles additional session fields.
    }
    return result;
};

export {
    GENDER_OPTIONS,
    PROVINCE_OPTIONS,
    buildUserUpdatePayload,
    hydrateUserInfoForm,
    persistUserInfoUpdate,
    validateUserUpdatePayload,
};
