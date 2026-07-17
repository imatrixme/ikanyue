<script setup lang="ts">
withDefaults(defineProps<{
  eyebrow?: string
  title: string
  description: string
  image?: string
  compact?: boolean
}>(), {
  eyebrow: undefined,
  image: undefined,
  compact: false,
})
</script>

<template>
  <section class="page-hero" :class="{ 'page-hero--compact': compact, 'page-hero--image': image }">
    <img v-if="image" :src="image" alt="" class="page-hero__image" loading="eager" fetchpriority="high">
    <div class="page-hero__shade" />
    <div class="site-container page-hero__inner">
      <p v-if="eyebrow" class="page-hero__eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
      <slot />
    </div>
  </section>
</template>
