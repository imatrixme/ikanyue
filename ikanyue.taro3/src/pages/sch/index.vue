<template>
  <view class="table">
    <view class="table-left">
      <text class="cell">时间</text>
      <view v-for="(item, index) in adaptedStyleOfHour()" :key="index">
        <text :class="item.style.class">{{ item.name }}</text>
      </view>
    </view>

    <view class="table-right-scroll">
      <view class="table-right-col" v-for="(day, index) in days" :key="index">
        <view class="cell big-cell date-cell">
          <text class="date-name">{{ day.name }}</text>
          <text class="date-str">({{ day.date }})</text>
        </view>
        <div class="table-oneday">
          <!-- <view class="table-right-row" v-for="(hour, hi) in hours" :key="hi">
            <text :class="adaptedHoursStyle4Hour(hour)"></text>
          </view> -->
          <view v-for="(item, index) in adaptedStyleOfPlaceholderHour()" :key="index">
            <text :class="item.style.class"></text>
          </view>
          <div class="table-oneday-overlay">
            <view
              class="oneday-schedule"
              v-for="(sch, schIdx) in adaptedSchedulesStyle4Day(day)"
              :key="schIdx"
              :style="{
                backgroundColor: 'pink',
                top: sch.style.top + 'px',
                height: sch.style.height + 'px',
                width: sch.style.width + 'px',
              }"
            >
              <text class="schedule-cell">{{ sch.title }}</text>
            </view>
          </div>
        </div>
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
    adaptedStyleOfHour: () => {
      that.hours.forEach((hour, index) => {
        hour.style = {
          class: ['cell'],
        };
        if (hour.disable) {
          hour.style.class.push('disable-cell');
        }
      });
      return that.hours;
    },

    adaptedStyleOfPlaceholderHour: () => {
      that.hours.forEach((hour, index) => {
        hour.style = {
          class: ['cell', 'big-cell'],
        };
        if (hour.disable) {
          hour.style.class.push('disable-cell');
          hour.style.class.push('disable-big-cell');
        }
      });
      return that.hours;
    },

    adaptedSchedulesStyle4Day: (day) => {
      let matched = that.schedules.filter((sch, idx) => {
        return sch.date === day.date;
      });

      let styled = matched.map((sch, idx) => {
        var sch_ = sch;
        var compacting = 0;
        that.hours.forEach((hour_) => {
          compacting += hour_.disable && sch.start >= hour_.start ? 20 : 0;
        });
        sch_.style = {
          top: (sch_.start - 900) * 0.01 * (42 + 1) - compacting,
          height: (sch_.end - sch_.start) * 0.01 * 42,
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
.table {
  display: flex;
  flex-direction: row;
  border-top: 1px solid red;
  border-left: 1px solid red;
}

.table-left {
  display: flex;
  flex-direction: column;
}

.cell {
  border-bottom: 1px solid red;
  border-right: 1px solid red;
  height: 42px;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 66px;
}

.disable-cell {
  height: 22px;
  background-color: #efefef;
}

.big-cell {
  padding: 0 32px;
}

.disable-big-cell {
  padding: 0 32px;
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
      background-color: green;
      // border-radius: 4px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
  }
}
</style>
