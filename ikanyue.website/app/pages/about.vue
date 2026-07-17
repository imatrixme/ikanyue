<script setup lang="ts">
useSeoMeta({
  title: '关于看乐',
  description: '了解看乐艺术的音乐教育方法、课程原则与学习共同体。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="ABOUT KANYUE"
      title="让音乐成为能够长期参与的生活"
      description="看乐艺术希望建立一种清楚、尊重差异，也愿意走向真实舞台的学习方式。"
      image="/images/hero-studio.webp"
    />
    <section class="section-band section-band--paper">
      <div class="site-container about-story">
        <UiSectionHeading eyebrow="OUR APPROACH" title="专业不等于制造距离" />
        <div class="about-story__copy">
          <p>儿童需要被认真对待，成人也不该因为起步较晚而降低对学习质量的要求。看乐使用同一套音乐标准，但根据每个人的经验、目标与生活节奏安排内容。</p>
          <p>课程从听觉、动作和真实曲目出发。理论、技巧与舞台实践不是独立模块，而是在解决具体音乐问题时逐步连接起来。</p>
        </div>
        <img src="/images/score.webp" alt="打开的乐谱" loading="lazy">
      </div>
    </section>
    <section class="section-band">
      <div class="site-container values-grid">
        <article><span>01</span><h2>清楚</h2><p>让学员理解目标、方法和反馈，而不是只完成一次课堂。</p></article>
        <article><span>02</span><h2>长期</h2><p>按照可持续的时间与难度组织学习，不追求短期表演效果。</p></article>
        <article><span>03</span><h2>真实</h2><p>通过作品、合作与舞台，让能力在真实音乐情境中发生。</p></article>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
