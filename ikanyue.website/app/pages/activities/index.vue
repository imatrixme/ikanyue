<script setup lang="ts">
const { activities, pending, error, refresh, usingFallback } = useActivities()

useSeoMeta({
  title: '声乐活动与展演',
  description: '看乐艺术近期的声乐开放课、工作坊、合唱排练与学员舞台展演。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="ACTIVITIES"
      title="课堂之外，声音需要在真实空间里发生"
      description="开放课、合唱排练、工作坊与阶段展演让学习被听见，也帮助学员理解协作、空间和舞台。"
      image="/images/vocal-performance.webp"
      image-alt="青少年学员在小型声乐展演舞台上演唱"
    />
    <section class="section-band section-band--paper">
      <div class="site-container">
        <div class="section-heading-row">
          <UiSectionHeading title="活动日历" description="时间与内容可能根据现场安排调整，请以活动详情为准。" />
          <p v-if="usingFallback" class="data-note">当前展示近期活动安排</p>
        </div>
        <UiAsyncState v-if="pending && !activities.length" state="loading" />
        <UiAsyncState
          v-else-if="error && !activities.length"
          state="error"
          title="活动暂时无法读取"
          description="请稍后重试，或通过咨询页面了解近期安排。"
          @retry="refresh"
        />
        <UiAsyncState v-else-if="!activities.length" state="empty" title="近期暂无公开活动" description="新的开放课、合唱排练与声乐展演确认后会在这里发布。" />
        <div v-else class="activity-list activity-list--page">
          <ContentActivityTicket v-for="activity in activities" :key="activity.id" :activity="activity" />
        </div>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
