<script setup lang="ts">
import { Check } from '@lucide/vue'
import { courses } from '~/data/site'

useSeoMeta({
  title: '音乐课程',
  description: '看乐艺术的钢琴、吉他、声乐与音乐素养课程，面向儿童、青少年与成人学习者。',
})

useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify(courses.map(course => ({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: course.title,
      description: course.description,
      provider: { '@type': 'MusicSchool', name: '看乐艺术 KANYUE' },
    }))),
  }],
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="COURSES"
      title="课程不是菜单，是一条可以走下去的路径"
      description="从第一次接触乐器，到建立稳定练习、理解作品并走向舞台，课程会围绕真实学习阶段持续调整。"
      image="/images/course-piano.webp"
    />

    <section class="section-band section-band--paper">
      <div class="site-container">
        <div class="course-grid course-grid--page">
          <ContentCourseCard v-for="(course, index) in courses" :key="course.slug" :course="course" :index="index" />
        </div>
      </div>
    </section>

    <section class="section-band">
      <div class="site-container learning-path">
        <UiSectionHeading eyebrow="HOW IT WORKS" title="一次清楚的开始，比选择更多更重要" />
        <ol>
          <li><span>01</span><div><h3>了解目标与经验</h3><p>确认年龄、音乐经历、可投入时间，以及希望解决的真实问题。</p></div></li>
          <li><span>02</span><div><h3>安排试听与评估</h3><p>通过一节真实课堂判断教师、内容和学习节奏是否匹配。</p></div></li>
          <li><span>03</span><div><h3>建立阶段计划</h3><p>把曲目、能力目标和舞台实践放进可回顾的学习周期。</p></div></li>
        </ol>
        <aside>
          <h3>课程共同包含</h3>
          <ul>
            <li><Check :size="18" aria-hidden="true" />明确的阶段目标</li>
            <li><Check :size="18" aria-hidden="true" />课堂与家庭练习反馈</li>
            <li><Check :size="18" aria-hidden="true" />适合时机的舞台实践</li>
            <li><Check :size="18" aria-hidden="true" />持续的学习记录</li>
          </ul>
        </aside>
      </div>
    </section>

    <ContentContactBand />
  </div>
</template>
