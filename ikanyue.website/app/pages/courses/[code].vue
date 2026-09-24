<script setup lang="ts">
const route = useRoute()
const code = computed(() => String(route.params.code || ''))
const { course, pending, error, refresh } = usePublicCourse(code)

useSeoMeta({
  title: () => course.value?.name || '课程详情',
  description: () => course.value
    ? `${course.value.name}，${course.value.durationMinutes} 分钟课程。查看当前公开课包与有效期。`
    : '查看看乐艺术当前公开课程。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      :title="course?.name || '课程详情'"
      :description="course ? `${course.durationMinutes} 分钟 · ${deliveryLabel(course.deliveryMode)}` : '正在读取当前课程信息。'"
      image="/images/vocal-adult.webp"
      image-alt="学员在看乐艺术声乐课堂中接受一对一指导"
    />
    <section class="section-band">
      <div class="site-container public-detail">
        <UiAsyncState v-if="pending" state="loading" title="正在读取课程" />
        <UiAsyncState
          v-else-if="error || !course"
          state="error"
          title="课程暂时无法读取"
          description="目录可能正在更新，请稍后重试。"
          @retry="refresh"
        />
        <template v-else>
          <div class="public-detail__facts">
            <dl>
              <div><dt>授课形式</dt><dd>{{ deliveryLabel(course.deliveryMode) }}</dd></div>
              <div><dt>单次时长</dt><dd>{{ course.durationMinutes }} 分钟</dd></div>
            </dl>
          </div>
          <div class="public-detail__body">
            <UiSectionHeading title="包含这门课程的当前课包" />
            <div v-if="course.packages.length" class="package-ledger">
              <ContentPackageLedgerRow
                v-for="coursePackage in course.packages"
                :key="coursePackage.code"
                :course-package="coursePackage"
                :handoff-href="`/contact?package=${encodeURIComponent(coursePackage.code)}`"
              />
            </div>
            <UiAsyncState v-else state="empty" title="当前没有公开课包" description="请联系教务确认排课方案。" />
          </div>
        </template>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
