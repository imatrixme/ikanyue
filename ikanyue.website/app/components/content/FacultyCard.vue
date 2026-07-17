<script setup lang="ts">
import type { FacultyMember } from '~/types/content'

defineProps<{ member: FacultyMember }>()
</script>

<template>
  <article class="faculty-card">
    <img :src="member.image" :alt="member.name" loading="lazy">
    <div class="faculty-card__body">
      <p>{{ member.role }}</p>
      <h3>{{ member.name }}</h3>
      <ul aria-label="教学方向">
        <li v-for="specialty in member.specialties" :key="specialty">{{ specialty }}</li>
      </ul>
      <blockquote>{{ member.statement }}</blockquote>
    </div>
  </article>
</template>
