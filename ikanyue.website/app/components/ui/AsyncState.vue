<script setup lang="ts">
import { AlertCircle, CalendarDays, LoaderCircle } from '@lucide/vue'

withDefaults(defineProps<{
  state: 'loading' | 'empty' | 'error'
  title?: string
  description?: string
}>(), {
  title: undefined,
  description: undefined,
})

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="async-state" role="status">
    <LoaderCircle v-if="state === 'loading'" class="async-state__spin" :size="28" aria-hidden="true" />
    <AlertCircle v-else-if="state === 'error'" :size="28" aria-hidden="true" />
    <CalendarDays v-else :size="28" aria-hidden="true" />
    <h2>{{ title || (state === 'loading' ? '正在读取' : state === 'error' ? '暂时无法读取' : '暂无内容') }}</h2>
    <p v-if="description">{{ description }}</p>
    <button v-if="state === 'error'" type="button" class="text-command" @click="emit('retry')">重新加载</button>
  </div>
</template>
