<template>
    <view class="container">
        <view class="unloginview" v-if="userInfo === undefined">
            <image class="logo" :src="images.logo" mode="widthFix" />
            <view class="content">
                <text class="incname">看乐艺术</text>
                <text class="slogan">提高歌唱水平，提升音乐认知</text>
            </view>
            <nut-button type="primary" class="loginbtn" @click="registerLogin">登录·注册</nut-button>
        </view>

        <view class="loginview" v-if="userInfo !== undefined">
            <image class="avatar" :src="userInfo.avatar" mode="widthFix" />
            <view class="content">
                <text class="nickname">{{ userInfo.nickName }}</text>
                <text class="province" v-if="userInfo.province !== undefined">{{ userInfo.province }}</text>
            </view>
            <nut-button type="default" class="modifybtn" @click="modifyInfo">修改信息</nut-button>
        </view>
    </view>
</template>

<script>
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { iNet } from "../../../utils/request";
import { UserManager } from "../../../utils/usermanager";

import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
dayjs.locale("zh-cn");

var that;
export default {
    data() {
        return {
            dayjs: dayjs,
            images: {
                logo: require("../../imgs/kanyuelogo.png")
            },
            userInfo: undefined
        };
    },
    created() {
        that = this;
    },
    mounted() {
        that.userInfo = UserManager.getUserInfo();
        that.refreshUserInfo();
    },
    methods: {
        refreshUserInfo: () => {
            if (!UserManager.isLogin()) {
                return;
            }
            UserManager.refreshLogin().finally(() => {
                that.userInfo = UserManager.getUserInfo();
            });
        },
        registerLogin: () => {
            if (UserManager.isLogin()) {
                return;
            }
            UserManager.login()
                .then(res => that.refreshUserInfo())
                .catch(err => console.log(err));
        },
        modifyInfo: () => {
            Taro.navigateTo({ url: "/pages/userinfo/index" });
        }
    }
};
</script>

<style lang="scss">
.container {
    padding: 16px;
}

.unloginview {
    display: flex;
    flex-direction: column;
    gap: 16px;
    justify-content: center;
    align-items: center;
    height: 88vh;

    .logo {
        width: 100px;
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        justify-content: center;
        align-items: center;

        .incname {
            font-size: 20px;
            font-weight: bolder;
            color: #202020;
        }
        .slogan {
            font-size: 14px;
            color: #888888;
        }
    }

    .loginbtn {
        margin-top: 16px;
        padding: 0 32px;
    }
}

.loginview {
    display: flex;
    flex-direction: column;
    gap: 16px;
    justify-content: center;
    align-items: center;
    height: 88vh;

    .avatar {
        width: 100px;
        height: 100px;
        border-radius: 50%;
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        justify-content: center;
        align-items: center;

        .nickName {
            font-size: 20px;
            font-weight: bolder;
            color: #202020;
        }
        .province {
            font-size: 13px;
            color: #888888;
        }
    }

    .modifybtn {
        margin-top: 16px;
        padding: 0 32px;
    }
}
</style>
