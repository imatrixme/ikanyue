<script setup lang="ts">
import { primaryNav } from '~/data/site'
</script>

<template>
  <footer class="site-footer">
    <div class="site-container site-footer__grid">
      <div class="site-footer__brand">
        <strong>看乐艺术 KANYUE</strong>
        <p>为儿童、青少年、成人与熟龄学习者提供清晰、长期的声乐训练。</p>
      </div>
      <nav aria-label="页脚导航">
        <NuxtLink v-for="item in primaryNav" :key="item.to" :to="item.to">{{ item.label }}</NuxtLink>
      </nav>
      <div class="site-footer__contact">
        <p>声乐课程与活动咨询</p>
        <NuxtLink to="/contact">微信咨询方式</NuxtLink>
        <NuxtLink to="/privacy">隐私说明</NuxtLink>
      </div>
    </div>
    <div class="site-container site-footer__legal">
      <div class="site-footer__legal-meta">
        <span>© {{ new Date().getFullYear() }} 看乐艺术</span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">沪ICP备2024042646号-1</a>
      </div>
      <span>Voice learning for every stage.</span>
    </div>
  </footer>
</template>
