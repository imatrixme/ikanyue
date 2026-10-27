<script setup lang="ts">
import { ArrowUpRight, Clock3, MapPin } from '@lucide/vue'
import type { Activity } from '~/types/content'
import { resolveActivityImage } from '~/utils/activity-media'

const props = defineProps<{ activity: Activity }>()

const start = computed(() => new Date(props.activity.startTime))
const month = computed(() => academyTime(start.value, { month: 'short' }))
const day = computed(() => academyTime(start.value, { day: '2-digit' }).replace(/\D/g, ''))
const weekday = computed(() => academyTime(start.value, { weekday: 'short' }))
const time = computed(() => academyTime(start.value, { hour: '2-digit', minute: '2-digit', hour12: false }))
const image = computed(() => resolveActivityImage(props.activity))
const summary = computed(() => props.activity.summary || props.activity.description || '查看本场活动的时间、地点与参与信息。')
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
      <p class="activity-ticket__summary">{{ summary }}</p>
      <NuxtLink :to="`/activities/${activity.id}`" :aria-label="`查看${activity.title}`">
        查看详情 <ArrowUpRight :size="17" aria-hidden="true" />
      </NuxtLink>
    </div>
  </article>
</template>
