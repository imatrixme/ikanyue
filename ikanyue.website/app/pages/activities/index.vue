<script setup lang="ts">
const { activities, pending, error, refresh, usingFallback } = useActivities()

useSeoMeta({
  title: '活动与演出',
  description: '看乐艺术近期的学员音乐会、开放课、工作坊与舞台活动。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="ACTIVITIES"
      title="课堂之外，音乐需要真实发生"
      description="音乐会、开放课和工作坊让学习被听见，也让新的问题自然出现。"
      image="/images/performance.webp"
    />
    <section class="section-band section-band--paper">
      <div class="site-container">
        <div class="section-heading-row">
          <UiSectionHeading title="活动日历" description="时间与内容可能根据现场安排调整，请以活动详情为准。" />
          <p v-if="usingFallback" class="data-note">当前展示本地活动预览</p>
        </div>
        <UiAsyncState v-if="pending && !activities.length" state="loading" />
        <UiAsyncState
          v-else-if="error && !activities.length"
          state="error"
          title="活动暂时无法读取"
          description="请稍后重试，或通过咨询页面了解近期安排。"
          @retry="refresh"
        />
        <UiAsyncState v-else-if="!activities.length" state="empty" title="近期暂无公开活动" description="新的开放课与演出确认后会在这里发布。" />
        <div v-else class="activity-list activity-list--page">
          <ContentActivityTicket v-for="activity in activities" :key="activity.id" :activity="activity" />
        </div>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
