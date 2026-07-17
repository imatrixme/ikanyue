<script setup lang="ts">
import { Clock3, MapPin, MessageCircle } from '@lucide/vue'

const form = reactive({ name: '', contact: '', learner: 'adult', interest: '', note: '' })
const submitted = ref(false)

function submitInquiry() {
  submitted.value = true
}

useSeoMeta({
  title: '预约咨询',
  description: '向看乐艺术咨询课程、试听与近期活动。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="CONTACT"
      title="先了解你想怎样学习"
      description="填写基本信息后，我们会围绕目标、经验和可投入时间沟通，再判断适合的课程与教师。"
      compact
    />
    <section class="section-band section-band--paper">
      <div class="site-container contact-layout">
        <aside class="contact-details">
          <div><MessageCircle :size="20" aria-hidden="true" /><span><strong>课程咨询</strong>通过微信或电话确认试听与课程安排</span></div>
          <div><Clock3 :size="20" aria-hidden="true" /><span><strong>咨询时间</strong>周二至周日 10:00 - 20:00</span></div>
          <div><MapPin :size="20" aria-hidden="true" /><span><strong>到访方式</strong>预约确认后发送教室地址与交通信息</span></div>
        </aside>

        <form class="inquiry-form" @submit.prevent="submitInquiry">
          <template v-if="!submitted">
            <label><span>怎么称呼你</span><input v-model="form.name" name="name" autocomplete="name" required></label>
            <label><span>联系方式</span><input v-model="form.contact" name="contact" autocomplete="tel" required></label>
            <fieldset>
              <legend>学习者</legend>
              <div class="segmented-control">
                <label><input v-model="form.learner" type="radio" value="child"><span>儿童 / 青少年</span></label>
                <label><input v-model="form.learner" type="radio" value="adult"><span>成人</span></label>
              </div>
            </fieldset>
            <label><span>感兴趣的课程</span>
              <select v-model="form.interest" name="interest" required>
                <option value="" disabled>请选择</option>
                <option>钢琴系统课程</option><option>吉他与弹唱</option><option>声乐与舞台表达</option><option>乐理与音乐素养</option>
              </select>
            </label>
            <label><span>希望我们提前了解的内容</span><textarea v-model="form.note" name="note" rows="5" placeholder="例如学习经历、目标或可上课时间" /></label>
            <button type="submit" class="site-button site-button--primary">提交咨询</button>
            <p class="form-note">当前为官网设计预览，提交不会发送到线上服务。</p>
          </template>
          <div v-else class="form-success" role="status">
            <h2>信息已记录</h2>
            <p>正式咨询接口接入后，这里会显示联系进度。当前预览不会保存个人信息。</p>
            <button type="button" class="text-command" @click="submitted = false">返回表单</button>
          </div>
        </form>
      </div>
    </section>
  </div>
</template>
