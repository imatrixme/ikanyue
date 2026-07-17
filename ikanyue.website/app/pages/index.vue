<script setup lang="ts">
import { ArrowDown, Music2 } from '@lucide/vue'
import { courses, faculty, learnerStories } from '~/data/site'

const { activities } = useActivities()

useSeoMeta({
  title: '看乐艺术 KANYUE',
  description: '面向儿童与成人的钢琴、吉他、声乐与音乐素养课程，以及真实的演出和艺术活动。',
  ogTitle: '看乐艺术 KANYUE',
  ogDescription: '音乐课程与艺术活动，让每个学习阶段都能找到清晰、长期的成长路径。',
  ogImage: '/images/hero-studio.webp',
})

useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'MusicSchool',
      name: '看乐艺术 KANYUE',
      description: '面向儿童与成人的音乐教育机构',
      url: useRuntimeConfig().public.siteUrl,
    }),
  }],
})
</script>

<template>
  <div>
    <section class="home-hero">
      <img src="/images/hero-studio.webp" alt="明亮的音乐教室与吉他、键盘等乐器" class="home-hero__image" loading="eager" fetchpriority="high">
      <div class="home-hero__shade" />
      <div class="site-container home-hero__content">
        <p class="home-hero__brand">看乐艺术 <span>KANYUE</span></p>
        <h1>音乐课程与艺术活动</h1>
        <p class="home-hero__lead">为儿童、家庭与成人学习者建立清晰、长期、能够走向舞台的音乐学习路径。</p>
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
          eyebrow="COURSE DIRECTORY"
          title="从兴趣开始，建立可持续的学习路径"
          description="课程按真实学习目标组织。儿童与成人使用同一套清晰标准，节奏和曲目会根据个人经验调整。"
        />
        <div class="course-grid">
          <ContentCourseCard v-for="(course, index) in courses" :key="course.slug" :course="course" :index="index" />
        </div>
      </div>
    </section>

    <section class="section-band">
      <div class="site-container">
        <div class="section-heading-row">
          <UiSectionHeading eyebrow="UPCOMING" title="近期活动" description="课堂之外，用排练、分享与舞台检验学习的真实变化。" />
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
          <Music2 :size="28" aria-hidden="true" />
          <p>TEACHING TEAM</p>
          <h2>教师不是课程的装饰，而是学习反馈的核心</h2>
          <p>我们关心学员听见了什么、理解了什么，以及下一次练习能否更清楚。</p>
          <UiSiteButton to="/faculty" variant="secondary" arrow>认识教师团队</UiSiteButton>
        </div>
        <div class="faculty-feature__grid">
          <ContentFacultyCard v-for="member in faculty.slice(0, 2)" :key="member.slug" :member="member" />
        </div>
      </div>
    </section>

    <section class="section-band">
      <div class="site-container story-preview">
        <UiSectionHeading eyebrow="LEARNER STORIES" title="学习发生在每一次具体的变化里" />
        <div class="story-preview__grid">
          <blockquote v-for="story in learnerStories" :key="story.name">
            <p>“{{ story.quote }}”</p>
            <footer><strong>{{ story.name }}</strong><span>{{ story.identity }}</span></footer>
          </blockquote>
        </div>
        <UiSiteButton to="/stories" variant="quiet" arrow>阅读更多故事</UiSiteButton>
      </div>
    </section>

    <ContentContactBand />
  </div>
</template>
