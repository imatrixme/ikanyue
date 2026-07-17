<script setup lang="ts">
useSeoMeta({
  title: '关于看乐',
  description: '了解看乐艺术的全年龄声乐教育方法、课程原则与长期训练标准。',
})
</script>

<template>
  <div>
    <LayoutPageHero
      eyebrow="ABOUT KANYUE"
      title="让声音成为能够长期使用与表达的能力"
      description="看乐艺术以年龄、身体状态与真实目标为起点，建立清楚、尊重差异，也能够走向合唱与舞台的声乐学习方式。"
      image="/images/vocal-community.webp"
      image-alt="不同年龄的声乐学习者在明亮教室中进行集体热身"
    />
    <section class="section-band section-band--paper">
      <div class="site-container about-story">
        <UiSectionHeading eyebrow="OUR APPROACH" title="专业不是制造距离，而是把复杂变化解释清楚" />
        <div class="about-story__copy">
          <p>儿童需要被认真对待，成年人也不该因为起步较晚而降低对学习质量的要求。看乐遵守同一套健康与表达标准，再根据年龄、声音状态、经验和生活节奏调整训练内容。</p>
          <p>课程从听觉、呼吸、语言和身体协调出发。技术、作品理解、合唱与舞台实践并非独立模块，而是在解决具体声音问题时逐步连接起来。</p>
        </div>
        <img src="/images/vocal-ensemble.webp" alt="分龄声乐学员使用谱架和声乐谱共同排练" loading="lazy">
      </div>
    </section>
    <section class="section-band">
      <div class="site-container values-grid">
        <article><span>01</span><h2>健康</h2><p>尊重年龄与身体边界，以舒适、稳定、可持续的用声方式作为所有训练前提。</p></article>
        <article><span>02</span><h2>清楚</h2><p>让学员理解目标、动作、听觉参照和判断方式，而不是只完成一次课堂。</p></article>
        <article><span>03</span><h2>真实</h2><p>通过作品、重唱、合唱与舞台，让声音能力在真实表达和协作中发生。</p></article>
      </div>
    </section>
    <ContentContactBand />
  </div>
</template>
