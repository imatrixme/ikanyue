<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

withDefaults(defineProps<{
  to?: string
  variant?: 'primary' | 'secondary' | 'quiet'
  arrow?: boolean
}>(), {
  to: undefined,
  variant: 'primary',
  arrow: false,
})
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="site-button" :class="`site-button--${variant}`">
    <slot />
    <ArrowRight v-if="arrow" :size="18" aria-hidden="true" />
  </NuxtLink>
  <button v-else type="button" class="site-button" :class="`site-button--${variant}`">
    <slot />
    <ArrowRight v-if="arrow" :size="18" aria-hidden="true" />
  </button>
</template>
