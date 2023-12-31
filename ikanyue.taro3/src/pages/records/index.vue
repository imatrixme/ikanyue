<template>
    <view class="container">
        <view class="empty" v-if="records === undefined || records.length === 0">
            <nut-empty image="empty"></nut-empty>
        </view>
        <view class="records" v-if="records !== undefined">
            <scroll-view class="season_list" :enableFlex="true" :enablePassive="true">
                <view
                    class="season"
                    v-for="(season, index) in records"
                    :key="season.sn"
                    @click="jump2SeasonDetail(season)"
                >
                    <view class="header">
                        <view class="icon_title">
                            <image class="icon_daka" :src="images.daka" mode="widthFix" />
                            <text class="term">第 {{ records.length - index }} 期</text>
                        </view>
                        <view class="icon_detail">
                            <nut-tag type="success" class="badge" v-if="season.courses.length > 0">
                                已完成 {{ season.courses.length }} 课
                            </nut-tag>
                            <nut-icon name="right" size="16" color="#F7931E"></nut-icon>
                        </view>
                    </view>
                    <view class="content">
                        <text class="ntype">类型：{{ season.ntype }} </text>
                        <text class="max_time">总课数：{{ 5 }} </text>
                        <view class="left_time">
                            余课数：{{ season.ncount - season.courses.length }}
                            <nut-tag
                                round
                                class="warning_tag"
                                type="danger"
                                v-if="season.courses.filter(c => !c.confirmed).length > 0"
                            >
                                未确认 {{ season.courses.filter(c => !c.confirmed).length }} 课
                            </nut-tag>
                        </view>
                        <text class="paytime"> 缴费时间：{{ dayjs(season.paytime).format("YYYY-MM-DD HH:mm") }} </text>
                        <text class="summary">概要信息：{{ season.summary }} </text>
                    </view>
                </view>
            </scroll-view>
        </view>
    </view>
</template>

<script>
import Taro, { eventCenter, getCurrentInstance } from "@tarojs/taro";
import { iNet } from "../../../utils/request";

import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
dayjs.locale("zh-cn");

var that;
export default {
    data() {
        return {
            dayjs: dayjs,
            images: {
                daka: require("../../imgs/daka.png")
            },
            records: undefined
        };
    },
    created() {
        that = this;
    },
    mounted() {
        eventCenter.on(getCurrentInstance().router.onShow, () => {
            that.fetchSeasons(false);
        });
    },

    methods: {
        fetchSeasons: (loading = true) => {
            return new Promise((resolve, reject) => {
                let url = "/v1/coursenxn/season/list";
                loading && Taro.showLoading({ title: "查询中..." });
                iNet.get(url)
                    .then(data => {
                        that.records = data;
                        resolve(data);
                    })
                    .catch(error => {
                        // console.log(error);
                        reject(error);
                    })
                    .finally(() => {
                        loading && Taro.hideLoading();
                    });
            });
        },

        /**
         * 跳转到学期详情页面
         * @param {Season} season 学期对象
         */
        jump2SeasonDetail: season => {
            Taro.navigateTo({ url: "/pages/courses/index?sn=" + season.sn });
        }
    },
    /**
     * 当下拉刷新时触发动作
     */
    onPullDownRefresh: () => {
        that.fetchSeasons().finally(() => {
            return Taro.stopPullDownRefresh();
        });
    }
};
</script>

<style lang="scss">
.container {
    padding: 16px;
}

.season_list {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 2px 0;
}

.season {
    border: 1px solid #ddd;
    border-radius: 16px;

    .header {
        // background-color: #f7931e;
        // color: #fff;
        padding: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #dfdfdf;

        &:active {
            background-color: #dfdfdf;
        }

        .icon_title,
        .icon_detail {
            display: flex;
            flex-direction: row;
            justify-content: center;
            align-items: center;
            gap: 4px;
            .icon_daka {
                width: 22px;
                height: 22px;
            }
            .badge {
                font-size: 13px;
                padding: 2px 6px;
            }
        }

        .term {
            font-size: 18px;
            font-weight: bold;
            color: #202020;
        }
    }

    .content {
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 14px;
        color: #404040;

        .left_time {
            .warning_tag {
                padding: 0 4px;
                margin-left: 4px;
            }
        }
    }
}
</style>
