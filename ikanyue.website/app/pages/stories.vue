<script setup lang="ts">
import { Check } from '@lucide/vue'
import { learnerJourneys } from '~/data/site'

useSeoMeta({
  title: '声乐学习路径',
  description: '按儿童、少儿、青少年、成人与熟龄阶段了解典型声乐成长任务与训练里程碑。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      title="没有统一的起点，只有当前最值得解决的问题"
      description="以下内容依据年龄与学习目标归纳，用于理解训练顺序；每个人的实际进度以课堂评估为准。"
      image="/images/vocal-mature.webp"
      image-alt="不同年龄的成年学员在老师带领下共同练习发声"
    />
    <section class="section-band">
      <div class="site-container journey-list">
        <article v-for="journey in learnerJourneys" :key="journey.stage" class="journey-card">
          <img :src="journey.image" :alt="journey.imageAlt" loading="lazy">
          <div class="journey-card__body">
            <p>{{ journey.stage }} · {{ journey.profile }}</p>
            <h2>{{ journey.title }}</h2>
            <p>{{ journey.summary }}</p>
            <ul>
              <li v-for="milestone in journey.milestones" :key="milestone">
                <Check :size="18" aria-hidden="true" />{{ milestone }}
              </li>
            </ul>
          </div>
        </article>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
