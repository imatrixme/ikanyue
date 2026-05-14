import { describe, expect, it } from 'vitest';
import {
    buildUserUpdatePayload,
    createGenderOptions,
    hydrateUserInfoForm,
    selectPickerOption,
} from './pageLogic';

describe('userinfo page logic', () => {
    it('hydrates form state from cached user info', () => {
        const state = hydrateUserInfoForm(
            {
                cellphone: '13800138000',
                realname: '王同学',
                nickname: '小王',
                age: 12,
                gender: '2',
                province: '上海市',
            },
            [{ text: '上海市', value: 'ShangHai' }],
            createGenderOptions()
        );

        expect(state).toMatchObject({
            currentCellphone: '13800138000',
            currentRealname: '王同学',
            currentNickname: '小王',
            currentAge: 12,
            currentGenderValue: 2,
            currentGenderText: '女',
            selectedGenderValue: '2',
            currentProvinceText: '上海市',
            currentProvinceValue: 'ShangHai',
            selectedProvinceValue: 'ShangHai',
        });
    });

    it('falls back for missing age, unknown gender, and unmatched province', () => {
        expect(hydrateUserInfoForm({ gender: 9, province: '火星' }, [], createGenderOptions())).toMatchObject({
            currentAge: 18,
            currentGenderValue: 9,
            currentGenderText: '未知',
            selectedGenderValue: '9',
            currentProvinceText: '火星',
            selectedProvinceValue: '',
        });
    });

    it('builds update payloads and selects picker options', () => {
        expect(
            buildUserUpdatePayload({
                currentRealname: '王同学',
                currentNickname: '小王',
                currentAge: '13',
                currentCellphone: '13800138000',
                currentProvinceText: '上海市',
                currentGenderValue: '1',
            })
        ).toEqual({
            realname: '王同学',
            nickname: '小王',
            age: 13,
            cellphone: '13800138000',
            province: '上海市',
            gender: 1,
        });

        expect(selectPickerOption([{ text: '男', value: 1 }])).toEqual({ text: '男', value: 1 });
        expect(selectPickerOption([])).toBeNull();
    });
});
