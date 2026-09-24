<script setup lang="ts">
import { Check } from '@lucide/vue'
import { courses } from '~/data/site'

const config = useRuntimeConfig()
const { catalog, pending, error, refresh } = useCourseCatalog()

useSeoMeta({
  title: '全年龄声乐课程',
  description: '看乐艺术为儿童、少儿、青少年、成人与熟龄学习者提供分龄声乐、合唱与舞台表达课程。',
})

useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify(courses.map(course => ({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: course.title,
      description: course.description,
      provider: { '@type': 'EducationalOrganization', name: '看乐艺术 KANYUE' },
    }))),
  }],
})
</script>

<template>
  <div>
    <LayoutPageHero
      title="声音会变化，训练路径也必须随年龄变化"
      description="我们从生理阶段、听觉经验、表达目标和可投入时间出发，建立能够被理解、被复习、也能够长期执行的声乐计划。"
      image="/images/vocal-school-age.webp"
      image-alt="少儿在钢琴辅助下对照谱架上的声乐谱进行视唱练耳"
    />

    <section class="section-band section-band--paper">
      <div class="site-container">
        <div class="course-grid course-grid--page">
          <ContentCourseCard v-for="(course, index) in courses" :key="course.slug" :course="course" :index="index" />
        </div>
      </div>
    </section>

    <section class="section-band">
      <div class="site-container public-catalog">
        <UiSectionHeading
          title="当前开放的课程规格与课包"
          description="价格、课点构成和有效期来自当前发布目录；提交前由教务确认适合的课程与教师。"
        />
        <UiAsyncState v-if="pending" state="loading" title="正在读取当前课程目录" />
        <UiAsyncState
          v-else-if="error"
          state="error"
          title="当前课程目录暂时不可用"
          description="您仍可查看训练路径，或直接联系教务。"
          @retry="refresh"
        />
        <UiAsyncState
          v-else-if="!catalog.courses.length && !catalog.packages.length"
          state="empty"
          title="当前暂无公开课包"
          description="课程顾问仍可根据年龄与目标提供建议。"
        />
        <template v-else>
          <nav v-if="catalog.courses.length" class="public-course-index" aria-label="当前开放课程">
            <NuxtLink
              v-for="course in catalog.courses"
              :key="course.code"
              :to="`/courses/${encodeURIComponent(course.code)}`"
            >
              <strong>{{ course.name }}</strong>
              <small>{{ course.durationMinutes }} 分钟 · {{ deliveryLabel(course.deliveryMode) }}</small>
            </NuxtLink>
          </nav>
          <div v-if="catalog.packages.length" class="package-ledger">
            <ContentPackageLedgerRow
              v-for="coursePackage in catalog.packages"
              :key="coursePackage.code"
              :course-package="coursePackage"
              :handoff-href="packageHandoffHref(coursePackage, config.public.miniProgramUrl)"
            />
          </div>
        </template>
      </div>
    </section>

    <section class="section-band section-band--paper">
      <div class="site-container learning-path">
        <UiSectionHeading title="先判断声音阶段，再决定训练重点" />
        <ol>
          <li><span>01</span><div><h3>了解年龄、目标与声音经验</h3><p>确认当前用声状态、既往学习、喜欢的作品、可投入时间，以及最希望改善的具体问题。</p></div></li>
          <li><span>02</span><div><h3>在真实课堂中观察</h3><p>通过呼吸、模唱、语言和短句练习判断听觉、协调与表达状态，也判断师生沟通是否匹配。</p></div></li>
          <li><span>03</span><div><h3>建立可以复盘的训练周期</h3><p>把声音能力、曲目任务、家庭练习与合适时机的舞台实践放进同一个阶段计划。</p></div></li>
        </ol>
        <aside>
          <h3>每条路径共同包含</h3>
          <ul>
            <li><Check :size="18" aria-hidden="true" />明确的阶段目标</li>
            <li><Check :size="18" aria-hidden="true" />听觉与身体感受的双重反馈</li>
            <li><Check :size="18" aria-hidden="true" />可执行的家庭练习说明</li>
            <li><Check :size="18" aria-hidden="true" />适龄、适时的合唱或舞台实践</li>
          </ul>
        </aside>
      </div>
    </section>

    <ContentContactBand />
  </div>
</template>
