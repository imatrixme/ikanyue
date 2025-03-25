<template>
    <view class="container">
        <nut-form>
            <nut-form-item label="昵称">
                <input class="nut-input-text" type="text" placeholder="请输入昵称" v-model="currentNickname" />
            </nut-form-item>
        </nut-form>
        <nut-form>
            <nut-form-item label="姓名">
                <input class="nut-input-text" placeholder="请输入姓名" type="text" v-model="currentRealname" />
            </nut-form-item>
            <nut-form-item label="性别">
                <input
                    class="nut-input-text"
                    placeholder="请选择性别"
                    type="text"
                    v-model="currentGenderText"
                    readonly
                    @click="showGenderPicker = true"
                />
            </nut-form-item>
            <nut-form-item label="年龄">
                <input class="nut-input-text" placeholder="请输入年龄" type="number" v-model="currentAge" />
            </nut-form-item>
            <nut-form-item label="联系电话">
                <input
                    class="nut-input-text"
                    placeholder="请输入联系电话"
                    type="number"
                    v-model="currentCellphone"
                    readonly
                    disabled
                />
            </nut-form-item>
            <nut-form-item label="省份">
                <input
                    class="nut-input-text"
                    placeholder="请选择省份"
                    type="text"
                    v-model="currentProvinceText"
                    readonly
                    @click="showProvincePicker = true"
                />
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
        <nut-picker
            :modelValue="currentProvince"
            :visible="showProvincePicker"
            @update:visible="(val) => (showProvincePicker = val)"
            :columns="provinces"
            title="城市选择"
            @confirm="
                ({ selectedValue, _ }) => {
                    saveProvinceObj(selectedValue);
                }
            "
        >
        </nut-picker>
        <nut-picker
            :modelValue="currentGender"
            :visible="showGenderPicker"
            @update:visible="(val) => (showGenderPicker = val)"
            :columns="[genders]"
            title="性别选择"
            @confirm="
                (val) => {
                    saveGenderObj(val.selectedValue);
                }
            "
        >
        </nut-picker>
    </view>
</template>

<script>
import Taro, { getCurrentInstance } from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';

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
            genders: [
                { text: '未知', value: 0 },
                { text: '男', value: 1 },
                { text: '女', value: 2 },
            ],
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
        };
    },
    created() {
        that = this;
    },
    mounted() {
        that.refreshUserInfo();
    },
    methods: {
        saveProvinceObj: (pvalue) => {
            const name = pvalue['0'];
            const target = that.provinces.filter((kv) => kv.value === name);
            const province = target && target.length > 0 ? target[0] : undefined;
            that.currentProvinceText = province ? province.text : undefined;
            that.currentProvinceValue = province ? province.value : undefined;
            that.currentProvince = pvalue;
        },
        saveGenderObj: (gvalue) => {
            // 确保从picker中获取的值转为数字
            const name = Number(gvalue['0']);

            // 查找对应的性别对象
            const target = that.genders.filter((kv) => kv.value === name);
            const gender = target && target.length > 0 ? target[0] : undefined;

            // 设置性别文本和值
            that.currentGenderText = gender ? gender.text : '未知';
            that.currentGenderValue = gender ? Number(gender.value) : 0;
            that.currentGender = gvalue;
        },
        refreshUserInfo: () => {
            // 从本地获取用户信息
            const userInfo = UserManager.getUserInfo();

            that.userInfo = userInfo;
            that.currentCellphone = userInfo.cellphone;
            that.currentRealname = userInfo.realname;
            that.currentNickname = userInfo.nickname;
            that.currentAge = userInfo.age || 18;
            that.currentProvinceText = userInfo.province;

            // 设置性别 - 修复性别显示问题
            // 确保将gender转换为数字类型
            const genderValue = userInfo.gender !== undefined ? Number(userInfo.gender) : 0;

            // 找到对应的性别对象
            const genderObj = that.genders.find((g) => g.value === genderValue);

            that.currentGenderValue = genderValue;
            that.currentGenderText = genderObj ? genderObj.text : '未知';
            that.currentGender = [genderValue]; // 直接使用数值
        },

        saveInfo: () => {
            // 确保性别是数字类型
            const genderValue = Number(that.currentGenderValue);

            const params = {
                realname: that.currentRealname,
                nickname: that.currentNickname,
                age: Number(that.currentAge), // 确保年龄是数字
                cellphone: that.currentCellphone,
                province: that.currentProvinceText,
                gender: genderValue,
            };

            Taro.showLoading({ title: '保存中...' });
            Api.updateUserInfo(params)
                .then((res) => {
                    Taro.showToast({
                        title: '更新成功',
                        icon: 'success',
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
                    });
                })
                .finally(() => {
                    Taro.hideLoading();
                });
        },
    },
};
</script>

<style lang="scss">
page {
    background-color: #f8f8f8;
}
.container {
}

.info-tips {
    font-size: 10px;
    color: #888888;
    padding: 4px 16px;
}

.info-action {
    padding: 8px 32px;
}

.nut-input-text {
    border: none;
}
</style>
