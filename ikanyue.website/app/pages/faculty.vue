<script setup lang="ts">
import { faculty } from '~/data/site'

useSeoMeta({
  title: '教师团队',
  description: '认识看乐艺术的钢琴、吉他、声乐与音乐素养教师。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="FACULTY"
      title="教学的质量，来自持续而具体的反馈"
      description="教师既要理解音乐，也要理解不同年龄和生活状态中的学习者。"
      image="/images/score.webp"
    />
    <section class="section-band">
      <div class="site-container faculty-page-grid">
        <ContentFacultyCard v-for="member in faculty" :key="member.slug" :member="member" />
      </div>
    </section>
    <section class="section-band section-band--paper">
      <div class="site-container teaching-principles">
        <UiSectionHeading eyebrow="TEACHING PRINCIPLES" title="共同的教学标准" />
        <div>
          <article><span>01</span><h3>先听见，再解释</h3><p>从声音和身体感受出发，让知识帮助学员解决正在发生的问题。</p></article>
          <article><span>02</span><h3>反馈必须可执行</h3><p>每节课都要让学员知道下一次练习具体做什么、如何判断变化。</p></article>
          <article><span>03</span><h3>舞台服务于成长</h3><p>演出不是额外压力，而是在合适阶段整理和呈现学习成果。</p></article>
        </div>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
