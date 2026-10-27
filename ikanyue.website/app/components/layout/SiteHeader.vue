<script setup lang="ts">
import { Menu, X } from '@lucide/vue'
import { primaryNav } from '~/data/site'

const menuOpen = ref(false)
const route = useRoute()

watch(() => route.fullPath, () => {
  menuOpen.value = false
})
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <NuxtLink to="/" class="site-brand" aria-label="看乐艺术首页">
        <span class="site-brand__cn">看乐艺术</span>
        <span class="site-brand__en">KANYUE</span>
      </NuxtLink>

      <nav class="site-nav" aria-label="主导航">
        <NuxtLink v-for="item in primaryNav" :key="item.to" :to="item.to">{{ item.label }}</NuxtLink>
      </nav>

      <NuxtLink to="/contact" class="site-header__contact">声乐咨询</NuxtLink>
      <button
        type="button"
        class="site-header__menu"
        :aria-expanded="menuOpen"
        aria-controls="mobile-navigation"
        :aria-label="menuOpen ? '关闭导航' : '打开导航'"
        @click="menuOpen = !menuOpen"
      >
        <X v-if="menuOpen" :size="22" aria-hidden="true" />
        <Menu v-else :size="22" aria-hidden="true" />
      </button>
    </div>

    <nav v-if="menuOpen" id="mobile-navigation" class="mobile-nav" aria-label="移动导航">
      <NuxtLink v-for="item in primaryNav" :key="item.to" :to="item.to">{{ item.label }}</NuxtLink>
      <NuxtLink to="/contact">声乐咨询</NuxtLink>
    </nav>
  </header>
</template>
