<template>
  <view class="container">
    <view class="title-zone">
      <!-- <text class="page-title">课程安排</text> -->
    </view>
    <view class="table">
      <view class="table-left">
        <text class="table-shiduan">
          时段
        </text>
        <view class="table-daytime">
          <view class="daytime-apm">
            <text
              v-for="(apm, index) in adaptedApms(apms)"
              :key="index"
              class="apme"
              :style="{
                height: apm.height + 'px',
              }"
            >
              {{ apm.name }}
            </text>
          </view>
          <view class="daytime-everyhour">
            <text v-for="(item, index) in hours" :key="index" :class="styleOfHour(item)">
              {{ item.disable ? '' : item.name }}
            </text>
          </view>
        </view>
      </view>

      <view class="table-right-scroll">
        <view class="table-right-col" v-for="(day, index) in days" :key="index">
          <view class="cell big-cell date-cell" :class="index % 2 === 0 ? 'cell-even' : 'cell-odd'">
            <text class="date-name">{{ day.name }}</text>
            <text class="date-str">({{ day.date }})</text>
          </view>
          <div class="table-oneday">
            <text
              class="table-right-row big-cell"
              v-for="(hour, hi) in hours"
              :key="hi"
              :class="styleOfBigHour(hour, index)"
            >
            </text>
            <div class="table-oneday-overlay">
              <view
                class="oneday-schedule"
                v-for="(sch, schIdx) in adaptedHours(day)"
                :key="schIdx"
                :style="{
                  top: sch.style.top + 'px',
                  height: sch.style.height + 'px',
                  width: '100%',
                }"
              >
                <text class="schedule-cell-title">{{ sch.title }}</text>
                <text class="schedule-cell-people">余 {{ sch.max - sch.current }} 人</text>
              </view>
            </div>
          </div>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { iNet } from '../../../utils/request';
import * as dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

const daytimes = require('../../data/daytime.json');

var that;
export default {
  data() {
    return {
      sysinfo: wx.getSystemInfoSync(),
      hours: [],
      days: [],
      schedules: [],
      apms: ['am', 'null', 'pm', 'even'],
      ratio: 1,
    };
  },
  created() {
    that = this;
  },
  mounted() {
    this.refreshDataset();
  },

  methods: {
    /**
     * 刷新数据
     */
    refreshDataset: () => {
      that.ratio = that.sysinfo.screenWidth / 375.0;
      that.hours = daytimes;
      that.days = that.getDaysOfThisWeek();
      return iNet.get('/v1/schedules').then((res) => {
        that.schedules = res;
      });
    },

    /**
     * 获取从现在开始之后的一周时间
     */
    getDaysOfThisWeek: () => {
      let monday = dayjs().startOf('day');
      let days = [0, 1, 2, 3, 4, 5, 6].map((delta) => {
        let day_ = monday.add(delta, 'day');
        return {
          name: day_.format('dddd'),
          date: day_.format('YYYY-MM-DD'),
        };
      });
      return days;
    },
    /**
     * 获取每小时单元格的动态样式
     * @param {Hour} hour
     */
    styleOfHour: (hour) => {
      var style = ['cell-hour'];
      if (hour.disable) {
        style.push('disable-cell');
      }
      return style;
    },
    styleOfBigHour: (hour, index) => {
      var style = ['cell'];
      if (hour.disable) {
        style.push('disable-cell');
      } else {
        style.push(index % 2 === 0 ? 'cell-even' : 'cell-odd');
      }
      return style;
    },
    /**
     * 获取时段单元格的动态样式
     * @param {String} apm 时段文字描述
     */

    adaptedApms: () => {
      let amps = that.apms.map((apm, idx) => {
        var unit_ht_ = 43;
        var span_ = 1;
        var name_ = '';
        if (apm === 'am') {
          span_ = 4;
          name_ = '上午';
        }
        if (apm === 'pm') {
          span_ = 4;
          name_ = '下午';
        }
        if (apm === 'even') {
          span_ = 3;
          name_ = '晚上';
        }
        let ht_ = Math.floor(unit_ht_ * that.ratio) * span_ - 1;
        return {
          name: name_,
          height: ht_,
        };
      });
      return amps;
    },

    /**
     * 预处理单日内的日程单元格样式
     * @param {Day} day 单日对象
     */
    adaptedHours: (day) => {
      let matched = that.schedules.filter((sch, idx) => {
        return sch.date === day.date;
      });
      let styled = matched.map((sch, idx) => {
        var sch_ = sch;
        let schSpan = (sch_.end - sch_.start) * 0.01;
        let topSpan = (sch_.start - 900) * 0.01;

        sch_.style = {
          top: Math.floor(43 * that.ratio) * topSpan,
          height: Math.floor(43 * that.ratio) * schSpan,
        };
        return sch_;
      });
      return styled;
    },
  },

  /**
   * 当下拉刷新时触发动作
   */
  onPullDownRefresh: () => {
    that.refreshDataset().then(() => {
      return wx.stopPullDownRefresh();
    });
  },
};
</script>

<style lang="scss">
$borderWidth: 1px;
$borderColor: #2782d730;
$deepBackground: #dfdfdf;
$scheduleColor: #1aad19;

.title-zone {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 0;
  .page-title {
    font-size: 16px;
    font-weight: bold;
    text-align: center;
  }
}

.table {
  display: flex;
  flex-direction: row;
  border-top: $borderWidth solid $borderColor;
}

.cell {
  border-bottom: $borderWidth solid $borderColor;
  border-right: $borderWidth solid $borderColor;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 42px;
  width: 66px;
}

.big-cell {
  width: 130px;
}

.disable-cell {
  background-color: $deepBackground;
}

.date-cell {
  display: flex;
  flex-direction: column;

  .date-name {
    font-weight: bold;
  }
  .date-str {
    font-size: 11px;
    color: gray;
  }
}

.cell-odd {
  background-color: #f8f8f8;
}

.cell-even {
  background-color: white;
}

.table-right-scroll {
  display: flex;
  flex-direction: row;
  overflow-x: scroll;
  white-space: nowrap;
}
.table-right-col {
  display: flex;
  flex-direction: column;
}

.table-oneday {
  position: relative;

  .table-oneday-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;

    .oneday-schedule {
      position: absolute;
      background-color: $scheduleColor;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: whitesmoke;

      .schedule-cell-title {
        font-size: 13px;
        font-weight: bold;
      }
      .schedule-cell-people {
        font-size: 11px;
      }
    }
  }
}

.table-left {
  display: flex;
  flex-direction: column;
  width: 90px;
  border-bottom: $borderWidth solid $borderColor;
  border-right: $borderWidth solid $borderColor;

  .table-shiduan {
    font-weight: bold;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 42px;
    width: 100%;
  }

  .table-daytime {
    display: flex;
    flex-direction: row;
    width: 100%;

    .cell-hour {
      border-right: none;
      border-top: $borderWidth solid $borderColor;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 42px;
      width: 66px;
    }

    .daytime-apm,
    .daytime-everyhour {
      display: flex;
      flex-direction: column;
      font-size: 14px;
      font-weight: bold;
    }
    .daytime-apm {
      width: 24px;
    }
    .daytime-everyhour {
      flex-grow: 1;
    }
    .apme {
      background-color: $deepBackground;
      border-top: $borderWidth solid $borderColor;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      width: 24px;
    }
  }
}
</style>
