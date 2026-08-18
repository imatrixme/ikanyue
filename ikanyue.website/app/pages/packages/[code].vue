<script setup lang="ts">
const route = useRoute()
const code = computed(() => String(route.params.code || ''))
const config = useRuntimeConfig()
const { coursePackage, pending, error, refresh } = usePublicPackage(code)

useSeoMeta({
  title: () => coursePackage.value?.name || '课包详情',
  description: () => coursePackage.value?.description || '查看看乐艺术当前公开课包、价格与有效期。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="COURSE PACKAGE"
      :title="coursePackage?.name || '课包详情'"
      :description="coursePackage?.description || '正在读取当前课包信息。'"
      image="/images/vocal-ensemble.webp"
      image-alt="看乐艺术学员在排练空间进行声乐训练"
    />
    <section class="section-band">
      <div class="site-container package-detail">
        <UiAsyncState v-if="pending" state="loading" title="正在读取课包" />
        <UiAsyncState
          v-else-if="error || !coursePackage"
          state="error"
          title="课包暂时无法读取"
          description="目录可能正在更新，请稍后重试。"
          @retry="refresh"
        />
        <template v-else>
          <header class="package-detail__price">
            <p>{{ coursePackage.code }}</p>
            <strong>{{ formatPackagePrice(coursePackage) }}</strong>
            <span v-if="coursePackage.price.listAmount > coursePackage.price.saleAmount">
              标准价 {{ coursePackage.price.listAmount }} {{ coursePackage.price.currency }}
            </span>
            <a :href="packageHandoffHref(coursePackage, config.public.miniProgramUrl)" class="site-button site-button--primary">
              {{ coursePackage.purchaseMode === 'mini_program' ? '前往小程序' : '联系教务确认' }}
            </a>
          </header>
          <div class="package-detail__terms">
            <section>
              <h2>包含课程点</h2>
              <ul>
                <li v-for="grant in coursePackage.grants" :key="`${grant.courseCode}-${grant.creditName}`">
                  <strong>{{ grant.quantity }} {{ grant.unitLabel }}</strong>
                  <span>{{ grant.creditName }}</span>
                  <NuxtLink v-if="grant.courseCode" :to="`/courses/${encodeURIComponent(grant.courseCode)}`">
                    {{ grant.courseName || '查看课程' }}
                  </NuxtLink>
                </li>
              </ul>
            </section>
            <section>
              <h2>激活与有效期</h2>
              <dl>
                <div><dt>有效期</dt><dd>{{ formatPackageValidity(coursePackage) }}</dd></div>
                <div><dt>激活方式</dt><dd>{{ coursePackage.validity.activationMode }}</dd></div>
                <div v-if="coursePackage.validity.activationDeadlineDays !== null">
                  <dt>激活期限</dt><dd>{{ coursePackage.validity.activationDeadlineDays }} 天内</dd>
                </div>
              </dl>
            </section>
          </div>
        </template>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
