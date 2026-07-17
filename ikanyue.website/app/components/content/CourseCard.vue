<script setup lang="ts">
import { ArrowUpRight } from '@lucide/vue'
import type { Course } from '~/types/content'

defineProps<{ course: Course; index: number }>()
</script>

<template>
  <article class="course-card">
    <div class="course-card__media">
      <img :src="course.image" :alt="course.imageAlt" loading="lazy">
      <span>{{ String(index + 1).padStart(2, '0') }}</span>
    </div>
    <div class="course-card__body">
      <p class="course-card__focus">{{ course.focus }}</p>
      <h3>{{ course.title }}</h3>
      <p>{{ course.description }}</p>
      <dl>
        <div><dt>适合</dt><dd>{{ course.audience }}</dd></div>
        <div><dt>形式</dt><dd>{{ course.schedule }}</dd></div>
      </dl>
      <NuxtLink to="/contact" :aria-label="`咨询${course.title}`">
        了解课程 <ArrowUpRight :size="17" aria-hidden="true" />
      </NuxtLink>
    </div>
  </article>
</template>
