const createGenderOptions = () => [
    { text: '未知', value: 0 },
    { text: '男', value: 1 },
    { text: '女', value: 2 },
];

const hydrateUserInfoForm = (userInfo = {}, provinces = [], genders = createGenderOptions()) => {
    const genderValue = userInfo.gender !== undefined ? Number(userInfo.gender) : 0;
    const genderObj = genders.find((gender) => gender.value === genderValue);
    const provinceObj = userInfo.province ? provinces.find((province) => province.text === userInfo.province) : null;

    return {
        currentCellphone: userInfo.cellphone,
        currentRealname: userInfo.realname,
        currentNickname: userInfo.nickname,
        currentAge: userInfo.age || 18,
        currentGenderValue: genderValue,
        currentGenderText: genderObj ? genderObj.text : '未知',
        selectedGenderValue: genderValue.toString(),
        currentProvinceText: provinceObj?.text || userInfo.province,
        currentProvinceValue: provinceObj?.value,
        selectedProvinceValue: provinceObj?.value || '',
    };
};

const buildUserUpdatePayload = (formState) => ({
    realname: formState.currentRealname,
    nickname: formState.currentNickname,
    age: Number(formState.currentAge),
    cellphone: formState.currentCellphone,
    province: formState.currentProvinceText,
    gender: Number(formState.currentGenderValue),
});

const selectPickerOption = (selectedOptions = []) => {
    return selectedOptions.length > 0 ? selectedOptions[0] : null;
};

export {
    buildUserUpdatePayload,
    createGenderOptions,
    hydrateUserInfoForm,
    selectPickerOption,
};
