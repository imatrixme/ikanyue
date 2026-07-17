<script setup lang="ts">
import { primaryNav } from '~/data/site'
</script>

<template>
  <footer class="site-footer">
    <div class="site-container site-footer__grid">
      <div class="site-footer__brand">
        <strong>看乐艺术 KANYUE</strong>
        <p>让儿童与成人都能以清晰、长期的方式学习音乐。</p>
      </div>
      <nav aria-label="页脚导航">
        <NuxtLink v-for="item in primaryNav" :key="item.to" :to="item.to">{{ item.label }}</NuxtLink>
      </nav>
      <div class="site-footer__contact">
        <p>课程与活动咨询</p>
        <NuxtLink to="/contact">查看联系方式</NuxtLink>
        <NuxtLink to="/privacy">隐私说明</NuxtLink>
      </div>
    </div>
    <div class="site-container site-footer__legal">
      <span>© {{ new Date().getFullYear() }} 看乐艺术</span>
      <span>Music learning for every stage.</span>
    </div>
  </footer>
</template>
