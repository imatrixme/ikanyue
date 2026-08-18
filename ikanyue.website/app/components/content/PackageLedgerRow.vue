<script setup lang="ts">
import { ArrowUpRight } from '@lucide/vue'
import type { PublicCoursePackage } from '~/types/content'

const props = defineProps<{
  coursePackage: PublicCoursePackage
  handoffHref: string
}>()

const price = computed(() => formatPackagePrice(props.coursePackage))
const validity = computed(() => formatPackageValidity(props.coursePackage))
</script>

<template>
  <article class="package-ledger-row">
    <header>
      <p>{{ coursePackage.code }}</p>
      <h3>{{ coursePackage.name }}</h3>
      <p>{{ coursePackage.description }}</p>
    </header>
    <dl>
      <div><dt>当前价格</dt><dd>{{ price }}</dd></div>
      <div><dt>有效期</dt><dd>{{ validity }}</dd></div>
      <div>
        <dt>包含</dt>
        <dd>{{ coursePackage.grants.map(grant => `${grant.quantity} ${grant.unitLabel} ${grant.creditName}`).join(' · ') }}</dd>
      </div>
    </dl>
    <NuxtLink :to="`/packages/${encodeURIComponent(coursePackage.code)}`" :aria-label="`查看${coursePackage.name}`">
      查看课包 <ArrowUpRight :size="17" aria-hidden="true" />
    </NuxtLink>
    <a class="package-ledger-row__handoff" :href="handoffHref" :aria-label="`咨询或购买${coursePackage.name}`">
      {{ coursePackage.purchaseMode === 'mini_program' ? '前往小程序' : '咨询购买' }}
    </a>
  </article>
</template>
