<script setup lang="ts">
import { Check, Clipboard, MessageCircle, Search } from '@lucide/vue'

const searchTerm = '看乐艺术'
const copyStatus = ref('')

async function copyWechatSearchTerm() {
  try {
    await navigator.clipboard.writeText(searchTerm)
    copyStatus.value = '已复制，可前往微信搜索'
  }
  catch {
    copyStatus.value = `请在微信中搜索“${searchTerm}”`
  }
}

useSeoMeta({
  title: '声乐课程咨询',
  description: '通过微信联系看乐艺术，咨询儿童、青少年、成人与熟龄声乐课程、试听和近期活动。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="CONTACT"
      title="先了解声音与目标，再讨论适合的课程"
      description="一次有效咨询不急于推荐课型。我们会先了解年龄、声音经验、可投入时间和最希望改善的问题。"
      image="/images/vocal-adult.webp"
      image-alt="成年学员与声乐老师在明亮教室中交流训练感受"
      compact
    />
    <section class="section-band section-band--paper">
      <div class="site-container contact-layout">
        <article class="contact-search-card">
          <MessageCircle :size="24" aria-hidden="true" />
          <p>微信咨询</p>
          <h2>搜索“看乐艺术”</h2>
          <p>在微信中搜索品牌名称，进入官方账号或小程序后发送“声乐咨询”，即可开始沟通。</p>
          <button type="button" class="site-button site-button--secondary" @click="copyWechatSearchTerm">
            <Clipboard :size="18" aria-hidden="true" />复制微信搜索词
          </button>
          <p v-if="copyStatus" class="copy-status" role="status">{{ copyStatus }}</p>
        </article>

        <div class="contact-preparation">
          <p class="contact-preparation__eyebrow">BEFORE WE TALK</p>
          <h2>准备三项信息，沟通会更准确</h2>
          <ul>
            <li><Check :size="18" aria-hidden="true" /><span><strong>学习者年龄</strong>儿童与青少年的声音阶段会直接影响训练内容。</span></li>
            <li><Check :size="18" aria-hidden="true" /><span><strong>既往经验</strong>包括是否上过声乐课、合唱经历和当前常唱曲目。</span></li>
            <li><Check :size="18" aria-hidden="true" /><span><strong>真实目标</strong>例如改善紧张、稳定音准、准备舞台，或长期保持声音活力。</span></li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section-band">
      <div class="site-container consultation-process">
        <UiSectionHeading eyebrow="CONSULTATION" title="从咨询到开始学习" description="具体安排以双方沟通和实际课堂评估为准，不在咨询阶段承诺固定进度。" />
        <ol>
          <li><span>01</span><Search :size="22" aria-hidden="true" /><div><h3>微信说明基本情况</h3><p>发送年龄、学习经历、目标和通常可上课时间。</p></div></li>
          <li><span>02</span><MessageCircle :size="22" aria-hidden="true" /><div><h3>确认试听或评估方式</h3><p>根据声音阶段安排适合的老师、课堂形式与观察重点。</p></div></li>
          <li><span>03</span><Check :size="22" aria-hidden="true" /><div><h3>形成阶段训练建议</h3><p>试听后再确认课程频率、练习方式和首个阶段目标。</p></div></li>
        </ol>
      </div>
    </section>
  </div>
</template>
