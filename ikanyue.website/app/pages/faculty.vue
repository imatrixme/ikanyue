<script setup lang="ts">
import { teachingRoles } from '~/data/site'

useSeoMeta({
  title: '教师团队',
  description: '了解看乐艺术按年龄与声音阶段协作的声乐教学团队、反馈方式与共同标准。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="FACULTY"
      title="教学质量来自听得见细节，也说得清下一步"
      description="不同年龄的声音有不同边界。团队按儿童、青少年、成人与熟龄阶段协作，但共享同一套健康、清楚、可执行的教学标准。"
      image="/images/vocal-adult.webp"
      image-alt="声乐老师在一对一课堂中观察成年学员的发声状态"
    />
    <section class="section-band">
      <div class="site-container faculty-page-grid">
        <ContentFacultyCard v-for="member in teachingRoles" :key="member.slug" :member="member" />
      </div>
    </section>
    <section class="section-band section-band--paper">
      <div class="site-container teaching-principles">
        <UiSectionHeading eyebrow="TEACHING PRINCIPLES" title="共同的教学标准" />
        <div>
          <article><span>01</span><h3>先听声音，再解释方法</h3><p>从气息、音色、语言和身体协调出发，让知识回应正在发生的声音问题。</p></article>
          <article><span>02</span><h3>反馈必须能够复现</h3><p>课堂调整需要转化为清楚的练习动作、听觉参照和判断标准，而不是抽象形容词。</p></article>
          <article><span>03</span><h3>舞台服务于阶段成长</h3><p>展演、重唱与合唱用于整理学习成果，不以高压比赛或短期效果替代长期能力。</p></article>
        </div>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
