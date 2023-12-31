<template>
    <view class="container">
        <view class="empty" v-if="!episodes || episodes.length === 0">
            <nut-empty image="empty"></nut-empty>
        </view>
        <view class="episodes" v-if="episodes && episodes.length > 0">
            <scroll-view class="episode_list" :enableFlex="true" :enablePassive="true">
                <view class="episode" v-for="(episode, index) in episodes" :key="episode.sn">
                    <view class="header">
                        <view class="icon_title">
                            <image class="icon_daka" :src="images.yanshiping" mode="widthFix" />
                            <text class="term">第 {{ episodes.length - index }} 课</text>
                        </view>
                        <view class="icon_detail">
                            <view v-if="episode.confirmed">
                                <nut-tag type="success" class="badge">
                                    已确认
                                </nut-tag>
                            </view>
                            <view v-if="!episode.confirmed">
                                <nut-button type="danger" class="badge_button" @click="makeConfimDialogVisible">
                                    去确认
                                </nut-button>
                                <nut-dialog
                                    title="温馨提示"
                                    content="请确认是否上过该课？"
                                    ok-text="确认"
                                    v-model:visible="confirm_dialog_visible"
                                    @cancel="makeConfirmDialogUnvisible"
                                    @ok="confirmEpisode(episode.sn)"
                                />
                            </view>
                        </view>
                    </view>
                    <view class="content">
                        <text class="form">类型：{{ episode.form }} </text>
                        <text class="teacher">老师：{{ episode.teacher.nickName }} </text>
                        <text class="startAt">开始时间：{{ dayjs(episode.startAt).format("YYYY-MM-DD HH:mm") }} </text>
                        <text class="endAt">结束时间：{{ dayjs(episode.endAt).format("YYYY-MM-DD HH:mm") }} </text>
                        <text class="confirmedAt" v-if="episode.confirmed">
                            确认时间：{{ dayjs(episode.confirmedAt).format("YYYY-MM-DD HH:mm") }}
                        </text>
                        <view class="summaryzone" @click="nutvisibleswitch">
                            <text class="summary">概要信息：{{ episode.detail.substring(0, 100) }} </text>
                            <view class="summarymore"><nut-icon name="tips"></nut-icon>详情</view>
                        </view>
                        <nut-actionsheet
                            v-model:visible="detail_sheet_visible"
                            :title="'第 ' + (episodes.length - index) + ' 课 · 概要信息'"
                        >
                            <view class="detailsheet">
                                <text class="detail">{{ episode.detail }} </text>
                            </view>
                        </nut-actionsheet>
                    </view>
                </view>
            </scroll-view>
        </view>
    </view>
</template>

<script>
import Taro, { getCurrentInstance } from "@tarojs/taro";
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
                yanshiping: require("../../imgs/yanshiping.png")
            },
            detail_sheet_visible: false,
            confirm_dialog_visible: false,
            seasonSn: undefined,
            episodes: undefined
        };
    },
    created() {
        that = this;
    },
    mounted() {
        const params = getCurrentInstance().router.params;
        that.seasonSn = params.sn;
        that.fetchEpisodes(that.seasonSn);
    },
    methods: {
        nutvisibleswitch: () => {
            that.detail_sheet_visible = !that.detail_sheet_visible;
        },
        fetchEpisodes: (seasonSn, loading = true) => {
            return new Promise((resolve, reject) => {
                if (!seasonSn || seasonSn.length === 0) {
                    reject(new Error("参数缺少"));
                    return;
                }
                loading && Taro.showLoading();
                const params = { seasonSn };
                iNet.get("/v1/coursenxn/episode/list", params)
                    .then(res => {
                        that.episodes = res;
                        resolve(res);
                    })
                    .catch(err => {
                        console.log(err);
                        reject(err);
                    })
                    .finally(() => {
                        loading && Taro.hideLoading();
                    });
            });
        },

        makeConfimDialogVisible: () => {
            that.confirm_dialog_visible = true;
        },
        makeConfirmDialogUnvisible: () => {
            that.confirm_dialog_visible = false;
        },
        confirmEpisode: episodeSn => {
            Taro.showLoading();
            const params = { episodeSn };
            iNet.post("/v1/coursenxn/episode/confirm", params)
                .catch(err => {
                    console.log(err);
                })
                .finally(() => {
                    that.makeConfirmDialogUnvisible();
                    that.fetchEpisodes(that.seasonSn);
                });
        }
    },
    /**
     * 当下拉刷新时触发动作
     */
    onPullDownRefresh: () => {
        that.fetchEpisodes(that.seasonSn, false).finally(() => {
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

.episode {
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
                font-size: 14px;
                padding: 2px 6px;
            }
            .badge_button {
                font-size: 14px;
                padding: 0 16px;
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

        .summaryzone {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            gap: 16px;

            .summary {
                max-height: 3em; /* Adjust the maximum height as needed */
                overflow: hidden;
                text-overflow: ellipsis;
                display: -webkit-box;
                -webkit-line-clamp: 2; /* Adjust the number of lines to display */
                -webkit-box-orient: vertical;
            }
            .summarymore {
                white-space: nowrap;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                font-size: 10px;
                color: gray;
            }
        }

        .detailsheet {
            padding: 12px 16px 48px 16px;
            text-indent: 2em;
            text-align: justify;
        }
    }
}
</style>
