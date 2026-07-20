<script setup lang="ts">
import { CalendarDays, Clock3, ExternalLink, MapPin } from '@lucide/vue'
import { resolveActivityImage } from '~/utils/activity-media'

const route = useRoute()
const { activity, pending, error, refresh } = useActivity(() => String(route.params.id))

const start = computed(() => activity.value ? new Date(activity.value.startTime) : null)
const dateText = computed(() => start.value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(start.value) : '')
const timeText = computed(() => start.value ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(start.value) : '')
const image = computed(() => activity.value ? resolveActivityImage(activity.value) : '/images/vocal-performance.webp')
const summary = computed(() => activity.value?.summary || activity.value?.description || '查看看乐艺术声乐活动详情。')

useSeoMeta({
  title: () => activity.value?.title || '活动详情',
  description: () => summary.value,
  ogImage: () => image.value,
})

useHead(() => activity.value ? {
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: activity.value.title,
      description: summary.value,
      startDate: activity.value.startTime,
      endDate: activity.value.endTime,
      location: activity.value.location ? { '@type': 'Place', name: activity.value.location } : undefined,
      image: [image.value],
    }),
  }],
} : {})
</script>

<!-- eslint-disable vue/no-v-html -->
<template>
  <div>
    <UiAsyncState v-if="pending && !activity" state="loading" title="正在读取活动" />
    <UiAsyncState
      v-else-if="error && !activity"
      state="error"
      title="没有找到这场活动"
      description="它可能已经更新或下架。"
      @retry="refresh"
    />
    <template v-else-if="activity">
      <section class="activity-detail-hero">
        <img :src="image" :alt="activity.title">
        <div class="activity-detail-hero__shade" />
        <div class="site-container activity-detail-hero__content">
          <NuxtLink to="/activities">活动日历</NuxtLink>
          <h1>{{ activity.title }}</h1>
        </div>
      </section>
      <section class="section-band section-band--paper">
        <div class="site-container activity-detail">
          <dl class="activity-detail__facts">
            <div><dt><CalendarDays :size="18" aria-hidden="true" />日期</dt><dd>{{ dateText }}</dd></div>
            <div><dt><Clock3 :size="18" aria-hidden="true" />时间</dt><dd>{{ timeText }}</dd></div>
            <div><dt><MapPin :size="18" aria-hidden="true" />地点</dt><dd>{{ activity.location || '待确认' }}</dd></div>
          </dl>
          <article class="activity-detail__body">
            <div
              v-if="activity.descriptionHtml"
              class="activity-detail__rich-text"
              v-html="activity.descriptionHtml"
            />
            <p v-else>{{ activity.description || '活动围绕声乐学习、排练或舞台实践展开，具体流程以发布页为准。' }}</p>
            <p>如需确认名额、适合年龄、用声要求或现场安排，请在参与之前与看乐艺术联系。</p>
            <a v-if="activity.externalLink" :href="activity.externalLink" target="_blank" rel="noreferrer">
              前往报名 <ExternalLink :size="17" aria-hidden="true" />
            </a>
            <UiSiteButton v-else to="/contact" arrow>咨询活动</UiSiteButton>
          </article>
        </div>
      </section>
      <ContentContactBand />
    </template>
  </div>
</template>
