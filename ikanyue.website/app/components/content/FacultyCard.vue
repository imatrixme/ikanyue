<script setup lang="ts">
import type { TeachingRole } from '~/types/content'

defineProps<{ member: TeachingRole }>()
</script>

<template>
  <article class="faculty-card">
    <img :src="member.image" :alt="member.imageAlt" loading="lazy">
    <div class="faculty-card__body">
      <p>{{ member.audience }}</p>
      <h3>{{ member.title }}</h3>
      <ul aria-label="教学方向">
        <li v-for="specialty in member.specialties" :key="specialty">{{ specialty }}</li>
      </ul>
      <p class="faculty-card__statement">{{ member.statement }}</p>
    </div>
  </article>
</template>
