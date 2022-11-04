<template>
  <view class="container" v-if="schedule != undefined">
    <view class="header">
      <text class="title">{{ schedule.title }}</text>
    </view>

    <view class="timer">
      <text class="title">活动时间</text>
      <text class="detail">
        <i class="date">{{ date }}</i>
        {{ timespan }}
      </text>
    </view>

    <view class="people">
      <text class="title">剩余名额</text>
      <text class="detail">
        <i class="current">{{ schedule.capacity - schedule.current }}</i>
        人
      </text>
    </view>

    <view class="operation">
      <button type="primary">去报名</button>
    </view>

    <view class="summary">
      <text class="title">简介</text>
      <text class="detail">
        {{ schedule.desc }}
      </text>
    </view>
  </view>
</template>

<script>
import Taro, { getCurrentInstance } from '@tarojs/taro';
import { iNet } from '../../../utils/request';
import * as dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

const schedules = require('../../data/schedule.json');

var that;
export default {
  data() {
    return {
      schedule: undefined,
      date: '',
      timespan: '',
    };
  },
  created() {
    that = this;
  },
  mounted() {
    let params = getCurrentInstance().router.params;
    that.fetchDetail(params.sn);
  },
  methods: {
    fetchDetail: (sn) => {
      let url = '/v1/schedule/detail';
      let paras = { sn };
      Taro.showLoading({ title: '查询中...' });
      iNet
        .get(url, paras)
        .then((data) => {
          console.log(data);
          that.schedule = data;
          that.updateDataset();
        })
        .catch((error) => {
          // console.log(error);
        })
        .finally(() => {
          Taro.hideLoading();
        });
    },

    updateDataset: () => {
      that.date = that.schedule.date + ' ' + dayjs(that.schedule.date, 'yyyy-MM-DD').format('(dddd)');
      that.timespan =
        dayjs(that.schedule.ostart, 'yyyy-MM-DD HH:mm:ss').format('HH:mm') +
        ' - ' +
        dayjs(that.schedule.oend, 'yyyy-MM-DD HH:mm:ss').format('HH:mm');
    },
  },
};
</script>

<style lang="scss">
.container {
  padding: 16px;
}
.header {
  display: flex;
  flex-direction: column;

  .title {
    font-size: 16px;
    font-weight: bold;
    color: #404040;
  }
}

.timer {
  margin-top: 16px;
  display: flex;
  flex-direction: column;

  .title {
    font-size: 18px;
    font-weight: bold;
    line-height: 28px;
  }

  .detail {
    font-size: 16px;
    font-weight: bold;

    .date {
      color: #9095a1;
      font-weight: normal;
    }
  }
}

.people {
  margin-top: 16px;
  display: flex;
  flex-direction: column;

  .title {
    font-size: 18px;
    font-weight: bold;
    line-height: 28px;
  }

  .detail {
    font-size: 16px;
    font-weight: bold;
    color: #9095a1;

    .current {
      font-size: 36px;
      color: black;
    }
  }
}

.operation {
  margin-top: 32px;
}

.summary {
  margin-top: 32px;
  display: flex;
  flex-direction: column;

  .title {
    font-size: 16px;
    line-height: 26px;
  }

  .detail {
    font-size: 14px;
    color: #9095a1;
  }
}
</style>
