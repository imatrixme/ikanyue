<script setup lang="ts">
withDefaults(defineProps<{
  eyebrow?: string
  title: string
  description?: string
  align?: 'start' | 'center'
}>(), {
  eyebrow: undefined,
  description: undefined,
  align: 'start',
})
</script>

<template>
  <header class="section-heading" :class="`section-heading--${align}`">
    <p v-if="eyebrow" class="section-heading__eyebrow">{{ eyebrow }}</p>
    <h2>{{ title }}</h2>
    <p v-if="description" class="section-heading__description">{{ description }}</p>
  </header>
</template>
