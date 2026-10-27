<script setup lang="ts">
import { ArrowDown, AudioLines } from '@lucide/vue'
import { courses, learnerJourneys, teachingRoles } from '~/data/site'

const { activities } = useActivities()

useSeoMeta({
  title: '看乐艺术 KANYUE',
  description: '面向儿童、青少年、成人与熟龄学习者的全年龄声乐课程、合唱排练与舞台实践。',
  ogTitle: '看乐艺术 KANYUE',
  ogDescription: '从第一次发现声音，到形成稳定表达，让每个年龄阶段都拥有清晰、长期的声乐路径。',
  ogImage: '/images/vocal-community.webp',
})

useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: '看乐艺术 KANYUE',
      description: '面向全年龄学习者的声乐教育机构',
      url: useRuntimeConfig().public.siteUrl,
    }),
  }],
})
</script>

<template>
  <div>
    <section class="home-hero">
      <img src="/images/vocal-community.webp" alt="儿童、青少年、成人与熟龄学员在老师带领下进行声音热身" class="home-hero__image" loading="eager" fetchpriority="high">
      <div class="home-hero__shade" />
      <div class="site-container home-hero__content">
        <p class="home-hero__brand">看乐艺术 <span>KANYUE VOICE</span></p>
        <h1>全年龄声乐课程</h1>
        <p class="home-hero__lead">从儿童第一次发现声音，到成人重新建立表达，再到熟龄阶段保持声音活力，训练始终围绕真实的人和真实的成长发生。</p>
        <div class="home-hero__actions">
          <UiSiteButton to="/courses" arrow>探索课程</UiSiteButton>
          <UiSiteButton to="/activities" variant="secondary">近期活动</UiSiteButton>
        </div>
        <a href="#course-directory" class="home-hero__continue" aria-label="继续浏览课程目录">
          <ArrowDown :size="18" aria-hidden="true" />
        </a>
      </div>
    </section>

    <section id="course-directory" class="section-band section-band--paper">
      <div class="site-container">
        <UiSectionHeading
          title="每个年龄阶段，都有不同的声音任务"
          description="课程按生理阶段、学习经验与表达目标组织。我们不使用一套方法覆盖所有人，也不以短期高音或音量替代长期能力。"
        />
        <div class="course-grid">
          <ContentCourseCard v-for="(course, index) in courses" :key="course.slug" :course="course" :index="index" />
        </div>
      </div>
    </section>

    <section class="section-band">
      <div class="site-container">
        <div class="section-heading-row">
          <UiSectionHeading title="近期声乐活动" description="开放课、工作坊、合唱排练与学员展演，让课堂中的变化被听见，也让新的目标自然出现。" />
          <UiSiteButton to="/activities" variant="quiet" arrow>全部活动</UiSiteButton>
        </div>
        <div class="activity-list">
          <ContentActivityTicket v-for="activity in activities.slice(0, 3)" :key="activity.id" :activity="activity" />
        </div>
      </div>
    </section>

    <section class="section-band section-band--green">
      <div class="site-container faculty-feature">
        <div class="faculty-feature__intro">
          <AudioLines :size="28" aria-hidden="true" />
          <h2>声乐教学的核心，是听见细微变化并给出可执行反馈</h2>
          <p>教学团队按年龄与声音阶段协作，关注身体感受、听觉判断、作品理解，以及下一次练习是否足够清楚。</p>
          <UiSiteButton to="/faculty" variant="secondary" arrow>认识教师团队</UiSiteButton>
        </div>
        <div class="faculty-feature__grid">
          <ContentFacultyCard v-for="member in teachingRoles.slice(0, 2)" :key="member.slug" :member="member" />
        </div>
      </div>
    </section>

    <section class="section-band">
      <div class="site-container story-preview">
        <UiSectionHeading title="声乐成长发生在一连串可感知的变化里" description="以下路径按年龄与学习目标归纳，用于帮助你判断当前阶段，不代表固定进度。" />
        <div class="story-preview__grid">
          <article v-for="journey in learnerJourneys.slice(0, 4)" :key="journey.stage">
            <span>{{ journey.stage }}</span>
            <h3>{{ journey.title }}</h3>
            <p>{{ journey.summary }}</p>
            <footer>{{ journey.profile }}</footer>
          </article>
        </div>
        <UiSiteButton to="/stories" variant="quiet" arrow>阅读更多故事</UiSiteButton>
      </div>
    </section>

    <ContentContactBand />
  </div>
</template>
