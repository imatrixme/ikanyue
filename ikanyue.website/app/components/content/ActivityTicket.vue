<script setup lang="ts">
import { ArrowUpRight, Clock3, MapPin } from '@lucide/vue'
import type { Activity } from '~/types/content'

const props = defineProps<{ activity: Activity }>()

const start = computed(() => new Date(props.activity.startTime))
const month = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'short' }).format(start.value))
const day = computed(() => String(start.value.getDate()).padStart(2, '0'))
const weekday = computed(() => new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(start.value))
const time = computed(() => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(start.value))
const image = computed(() => props.activity.coverImageUrl || props.activity.coverImage || '/images/performance.webp')
</script>

<template>
  <article class="activity-ticket">
    <div class="activity-ticket__date" aria-hidden="true">
      <span>{{ month }}</span>
      <strong>{{ day }}</strong>
      <span>{{ weekday }}</span>
    </div>
    <img :src="image" :alt="activity.title" loading="lazy">
    <div class="activity-ticket__body">
      <div class="activity-ticket__meta">
        <span><Clock3 :size="15" aria-hidden="true" />{{ time }}</span>
        <span v-if="activity.location"><MapPin :size="15" aria-hidden="true" />{{ activity.location }}</span>
      </div>
      <h3>{{ activity.title }}</h3>
      <p>{{ activity.description || '查看本场活动的时间、地点与参与信息。' }}</p>
      <NuxtLink :to="`/activities/${activity.id}`" :aria-label="`查看${activity.title}`">
        查看详情 <ArrowUpRight :size="17" aria-hidden="true" />
      </NuxtLink>
    </div>
  </article>
</template>
