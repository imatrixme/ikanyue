<template>
    <view class="userinfo-page">
        <view class="userinfo-content">
            <nut-form>
            <nut-form-item label="昵称">
                <view class="input-field">
                    <input v-model="currentNickname" placeholder="请输入昵称" type="text" class="native-input" />
                </view>
            </nut-form-item>

            <nut-form-item label="姓名">
                <view class="input-field">
                    <input v-model="currentRealname" placeholder="请输入姓名" type="text" class="native-input" />
                </view>
            </nut-form-item>

            <nut-form-item label="性别">
                <view class="picker-field" @click="openGenderPicker">
                    <view class="picker-value">{{ currentGenderText || '请选择性别' }}</view>
                    <nut-icon name="right" size="14px" color="#999"></nut-icon>
                </view>
            </nut-form-item>

            <nut-form-item label="年龄">
                <view class="input-field">
                    <input v-model="currentAge" placeholder="请输入年龄" type="number" class="native-input" />
                </view>
            </nut-form-item>

            <nut-form-item label="联系电话">
                <view class="disabled-field">
                    <view class="disabled-value">{{ currentCellphone }}</view>
                </view>
            </nut-form-item>

            <nut-form-item label="省份">
                <view class="picker-field" @click="openProvincePicker">
                    <view class="picker-value">{{ currentProvinceText || '请选择省份' }}</view>
                    <nut-icon name="right" size="14px" color="#999"></nut-icon>
                </view>
            </nut-form-item>
            </nut-form>

            <view class="info-tips">
                <text>
                    *
                    以上信息不会泄露给任何第三方，仅用于评估交流计划。由于声乐学习与年龄、地域语言习惯密切相关，如实填写以上信息，将有助于我们制定更具针对性的学习计划。姓名、电话号码将用于日常教学联系，包括但不限于预约、问题与反馈等。
                </text>
            </view>
            <view class="info-action">
                <nut-button type="primary" size="large" class="savebtn" @click="saveInfo">保存</nut-button>
            </view>
        </view>

        <view class="logout-footer">
            <view class="logout-link" @click="logout">退出登录</view>
        </view>

        <!-- 性别选择器 -->
        <nut-picker
            :visible="showGenderPicker"
            @update:visible="(val) => (showGenderPicker = val)"
            :columns="gendersForPicker"
            title="性别选择"
            :modelValue="[selectedGenderValue]"
            @confirm="onGenderConfirm"
        />

        <!-- 省份选择器 -->
        <nut-picker
            :visible="showProvincePicker"
            @update:visible="(val) => (showProvincePicker = val)"
            :columns="provincesForPicker"
            title="省份选择"
            :modelValue="[selectedProvinceValue]"
            @confirm="onProvinceConfirm"
        />
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import { buildUserUpdatePayload, createGenderOptions, hydrateUserInfoForm, selectPickerOption } from './pageLogic';
import './index.scss';

var that;
export default {
    data() {
        return {
            userInfo: undefined,
            showProvincePicker: false,
            showGenderPicker: false,
            currentProvince: undefined,
            currentProvinceText: undefined,
            currentProvinceValue: undefined,
            currentGender: undefined,
            currentGenderText: undefined,
            currentGenderValue: 0,
            currentRealname: undefined,
            currentNickname: undefined,
            currentCellphone: undefined,
            currentAge: 18,
            genders: createGenderOptions(),
            provinces: [
                { text: '安徽省', value: 'AnHui' },
                { text: '澳门特别行政区', value: 'AoMen' },
                { text: '北京市', value: 'BeiJing' },
                { text: '重庆市', value: 'ChongQing' },
                { text: '福建省', value: 'FuJian' },
                { text: '甘肃省', value: 'GanSu' },
                { text: '广东省', value: 'GuangDong' },
                { text: '广西壮族自治区', value: 'GuangXi' },
                { text: '贵州省', value: 'GuiZhou' },
                { text: '海南省', value: 'HaiNan' },
                { text: '河北省', value: 'HeBei' },
                { text: '河南省', value: 'HeNan' },
                { text: '黑龙江省', value: 'HeiLongJiang' },
                { text: '湖北省', value: 'HuBei' },
                { text: '湖南省', value: 'HuNan' },
                { text: '吉林省', value: 'JiLin' },
                { text: '江苏省', value: 'JiangSu' },
                { text: '江西省', value: 'JiangXi' },
                { text: '辽宁省', value: 'LiaoNing' },
                { text: '内蒙古自治区', value: 'NeiMengGu' },
                { text: '宁夏回族自治区', value: 'NingXia' },
                { text: '青海省', value: 'QingHai' },
                { text: '山东省', value: 'ShanDong' },
                { text: '山西省', value: 'ShanXi' },
                { text: '陕西省', value: 'ShanXiSheng' },
                { text: '上海市', value: 'ShangHai' },
                { text: '四川省', value: 'SiChuan' },
                { text: '台湾省', value: 'TaiWan' },
                { text: '天津市', value: 'TianJin' },
                { text: '香港特别行政区', value: 'XiangGang' },
                { text: '新疆维吾尔自治区', value: 'XinJiang' },
                { text: '西藏自治区', value: 'XiZang' },
                { text: '云南省', value: 'YunNan' },
                { text: '浙江省', value: 'ZheJiang' },
            ],
            provincesForPicker: [],
            gendersForPicker: [],
            selectedGenderValue: '',
            selectedProvinceValue: '',
        };
    },
    created() {
        that = this;
        this.provincesForPicker = [this.provinces];
        this.gendersForPicker = [this.genders];
    },
    mounted() {
        that.refreshUserInfo();
    },
    methods: {
        onProvinceConfirm({ selectedValue, selectedOptions }) {
            const province = selectPickerOption(selectedOptions);
            if (province) {
                that.currentProvinceText = province.text;
                that.currentProvinceValue = province.value;
                that.selectedProvinceValue = province.value;
            }
        },
        onGenderConfirm({ selectedValue, selectedOptions }) {
            const gender = selectPickerOption(selectedOptions);
            if (gender) {
                that.currentGenderText = gender.text;
                that.currentGenderValue = Number(gender.value);
                that.selectedGenderValue = gender.value.toString();
            }
        },
        openGenderPicker() {
            // 确保选择器打开时已经有正确的初始值
            that.selectedGenderValue = that.currentGenderValue !== undefined ? that.currentGenderValue.toString() : '0';
            that.showGenderPicker = true;
        },
        openProvincePicker() {
            // 确保选择器打开时已经有正确的初始值
            that.selectedProvinceValue = that.currentProvinceValue || '';
            that.showProvincePicker = true;
        },
        refreshUserInfo: () => {
            // 从本地获取用户信息
            const userInfo = UserManager.getUserInfo();

            that.userInfo = userInfo;
            Object.assign(that, hydrateUserInfoForm(userInfo, that.provinces, that.genders));
        },

        saveInfo: () => {
            const params = buildUserUpdatePayload(that);

            Taro.showLoading({ title: '保存中...' });
            Api.updateUserInfo(params)
                .then((res) => {
                    Taro.showToast({
                        title: '更新成功',
                        icon: 'success',
                        duration: 1500,
                    });
                })
                .then(() => {
                    // 主动获取最新用户信息
                    return Api.refreshLogin();
                })
                .then(() => {
                    // 获取最新缓存的用户信息并更新界面
                    that.refreshUserInfo();
                })
                .catch((err) => {
                    Taro.showToast({
                        title: err.message || '更新失败',
                        icon: 'none',
                        duration: 1500,
                    });
                })
                .finally(() => {
                    Taro.hideLoading();
                });
        },
        logout: () => {
            UserManager.logout();
            Taro.showToast({
                title: '已退出',
                icon: 'none',
            });
            setTimeout(() => {
                Taro.switchTab({ url: '/pages/profile/index' });
            }, 500);
        },
    },
};
</script>
