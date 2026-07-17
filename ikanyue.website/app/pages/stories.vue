<script setup lang="ts">
import { learnerStories } from '~/data/site'

useSeoMeta({
  title: '学员故事',
  description: '儿童、家庭与成人学习者在看乐艺术的真实学习体验。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="LEARNER STORIES"
      title="音乐学习改变的，不只是一首曲子"
      description="这些故事关注练习方式、家庭沟通、个人表达，以及一个人如何重新理解自己的声音。"
      image="/images/piano-detail.webp"
    />
    <section class="section-band">
      <div class="site-container stories-list">
        <article v-for="(story, index) in learnerStories" :key="story.name">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <blockquote>“{{ story.quote }}”</blockquote>
          <footer>
            <strong>{{ story.name }}</strong>
            <span>{{ story.identity }}</span>
            <span>{{ story.course }}</span>
          </footer>
        </article>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
