<template>
    <view class="container">
        <nut-form>
            <nut-form-item label="昵称">
                <input class="nut-input-text" placeholder="请输入昵称" type="nickname" v-model="currentNickname" />
            </nut-form-item>
        </nut-form>
        <nut-form>
            <nut-form-item label="姓名">
                <input class="nut-input-text" placeholder="请输入姓名" type="nickname" v-model="currentRealname" />
            </nut-form-item>
            <nut-form-item label="年龄">
                <input class="nut-input-text" placeholder="请输入年龄" type="number" v-model="currentAge" />
            </nut-form-item>
            <nut-form-item label="联系电话">
                <input class="nut-input-text" placeholder="请输入联系电话" type="number" v-model="currentCellphone" />
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
                以上信息不会泄露给任何第三方，仅用于评估教学计划。由于声乐学习与年龄、地域语言习惯密切相关，如实填写以上信息，将有助于我们制定更具针对性的学习计划。姓名、电话号码将用于日常教学联系，包括但不限于预约、问题与反馈等。
            </text>
        </view>
        <view class="info-action">
            <nut-button type="primary" size="large" class="savebtn" @click="saveInfo">保存</nut-button>
        </view>
        <nut-picker
            v-model="currentProvince"
            v-model:visible="showProvincePicker"
            :columns="provinces"
            title="城市选择"
            @confirm="
                ({ selectedValue, _ }) => {
                    saveProvinceObj(selectedValue);
                }
            "
        >
        </nut-picker>
    </view>
</template>

<script>
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { iNet } from "../../../utils/request";

var that;
export default {
    data() {
        return {
            userInfo: undefined,
            showProvincePicker: false,
            currentProvince: undefined,
            currentProvinceText: undefined,
            currentProvinceValue: undefined,
            currentRealname: undefined,
            currentNickname: undefined,
            currentCellphone: undefined,
            currentAge: 18,
            provinces: [
                { text: "安徽省", value: "AnHui" },
                { text: "澳门特别行政区", value: "AoMen" },
                { text: "北京市", value: "BeiJing" },
                { text: "重庆市", value: "ChongQing" },
                { text: "福建省", value: "FuJian" },
                { text: "甘肃省", value: "GanSu" },
                { text: "广东省", value: "GuangDong" },
                { text: "广西壮族自治区", value: "GuangXi" },
                { text: "贵州省", value: "GuiZhou" },
                { text: "海南省", value: "HaiNan" },
                { text: "河北省", value: "HeBei" },
                { text: "河南省", value: "HeNan" },
                { text: "黑龙江省", value: "HeiLongJiang" },
                { text: "湖北省", value: "HuBei" },
                { text: "湖南省", value: "HuNan" },
                { text: "吉林省", value: "JiLin" },
                { text: "江苏省", value: "JiangSu" },
                { text: "江西省", value: "JiangXi" },
                { text: "辽宁省", value: "LiaoNing" },
                { text: "内蒙古自治区", value: "NeiMengGu" },
                { text: "宁夏回族自治区", value: "NingXia" },
                { text: "青海省", value: "QingHai" },
                { text: "山东省", value: "ShanDong" },
                { text: "山西省", value: "ShanXi" },
                { text: "陕西省", value: "ShanXiSheng" },
                { text: "上海市", value: "ShangHai" },
                { text: "四川省", value: "SiChuan" },
                { text: "台湾省", value: "TaiWan" },
                { text: "天津市", value: "TianJin" },
                { text: "香港特别行政区", value: "XiangGang" },
                { text: "新疆维吾尔自治区", value: "XinJiang" },
                { text: "西藏自治区", value: "XiZang" },
                { text: "云南省", value: "YunNan" },
                { text: "浙江省", value: "ZheJiang" }
            ]
        };
    },
    created() {
        that = this;
    },
    mounted() {
        that.refreshUserInfo();
    },
    methods: {
        saveProvinceObj: pvalue => {
            const name = pvalue["0"];
            const target = that.provinces.filter(kv => kv.value === name);
            const province = target && target.length > 0 ? target[0] : undefined;
            that.currentProvinceText = province ? province.text : undefined;
            that.currentProvinceValue = province ? province.value : undefined;
            that.currentProvince = pvalue;
        },
        refreshUserInfo: () => {
            iNet.get("/v1/user/catchprivacyinfo")
                .then(res => {
                    that.userInfo = res;
                    that.currentCellphone = res.cellphone;
                    that.currentRealname = res.realname;
                    that.currentNickname = res.nickname;
                    that.currentAge = res.age;
                    that.currentProvinceText = res.province;
                })
                .catch(err => console.log(err));
        },

        saveInfo: () => {
            const params = {
                realname: that.currentRealname,
                nickname: that.currentNickname,
                age: that.currentAge,
                cellphone: that.currentCellphone,
                province: that.currentProvinceText
            };
            Taro.showLoading({ title: "保存中..." });
            iNet.post("/v1/user/updateprivacyinfo", params)
                .catch(err => {
                    console.log(err);
                })
                .finally(() => {
                    Taro.hideLoading();
                    that.refreshUserInfo();
                });
        }
    }
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
</style>
