<template>
  <view class="container">
    <view class="title-zone">
      <text class="page-title">课程安排</text>
    </view>
    <view class="table">
      <view class="table-left">
        <text class="table-shiduan">时段</text>
        <view class="table-daytime">
          <view class="daytime-apm">
            <text v-for="(item, index) in apms" :key="index" :class="styleOfApm(item)">
              {{ item }}
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
              :class="styleOfHour(hour, index)"
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
                  width: sch.style.width + 'px',
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
const daytimes = require('../../data/daytime.json');
const weekdays = require('../../data/weekday.json');
const classes = require('../../data/schedule.json');

var that;
export default {
  data() {
    return {
      count: 0,
      hours: [],
      days: [],
      schedules: [],
      apms: ['上午', '', '下午', '晚上'],
    };
  },

  created() {
    that = this;
  },
  mounted() {
    this.hours = daytimes;
    this.days = weekdays;
    this.schedules = classes;
  },

  computed: {
    // x() {
    //   console.log('day');
    // },
  },

  methods: {
    styleOfHour: (hour, index) => {
      var style = ['cell'];
      if (hour.disable) {
        style.push('disable-cell');
      } else {
        style.push(index % 2 === 0 ? 'cell-even' : 'cell-odd');
      }
      return style;
    },

    styleOfApm: (apm) => {
      let map = {
        上午: 'apme-am',
        下午: 'apme-pm',
        晚上: 'apme-even',
      };
      return ['apme', map[apm]];
    },

    adaptedHours: (day) => {
      let matched = that.schedules.filter((sch, idx) => {
        return sch.date === day.date;
      });
      let styled = matched.map((sch, idx) => {
        var sch_ = sch;
        let hourspan = (sch_.end - sch_.start) / 100.0;
        sch_.style = {
          top: (sch_.start - 900) * 0.01 * (42 + 1),
          height: (sch_.end - sch_.start) * 0.01 * 42 + (hourspan - 1),
          width: 66 + 32 * 2,
        };
        return sch_;
      });
      return styled;
    },
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
  border-left: $borderWidth solid $borderColor;
}

.table-left {
  display: flex;
  flex-direction: column;

  .table-daytime {
    display: flex;
    flex-direction: row;

    .daytime-apm,
    .daytime-everyhour {
      display: flex;
      flex-direction: column;
      font-size: 14px;
      font-weight: bold;
    }
  }
}

.cell {
  border-bottom: $borderWidth solid $borderColor;
  border-right: $borderWidth solid $borderColor;
  min-height: 42px;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 66px;
}

.big-cell {
  padding: 0 32px;
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
    // background-color: gray;

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

.table-shiduan {
  border-bottom: $borderWidth solid $borderColor;
  border-right: $borderWidth solid $borderColor;
  min-height: 42px;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 91px;
  font-weight: bold;
}
.apme {
  width: 24px;
  background-color: $deepBackground;
  border-bottom: $borderWidth solid $borderColor;
  border-right: $borderWidth solid $borderColor;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  min-height: 42px;
}
.apme-am {
  min-height: 171px;
}
.apme-pm {
  min-height: 171px;
}
.apme-even {
  min-height: 128px;
}
</style>
