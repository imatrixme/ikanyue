<script setup lang="ts">
useSeoMeta({ title: '隐私说明', description: '看乐艺术官网隐私与数据使用说明。' })
</script>

<template>
  <div>
    <LayoutPageHero eyebrow="PRIVACY" title="隐私说明" description="我们只在提供课程咨询和活动服务所需的范围内处理信息。" compact />
    <section class="section-band">
      <article class="site-container prose-page">
        <h2>当前预览</h2>
        <p>本分支中的咨询表单是界面预览，不会向服务器提交或持久化姓名、联系方式和学习信息。</p>
        <h2>正式上线后的信息范围</h2>
        <p>正式接入咨询服务后，仅收集完成联系所需的信息，例如称呼、联系方式、学习者类型、课程意向和主动填写的说明。</p>
        <h2>使用目的</h2>
        <p>这些信息仅用于课程沟通、试听安排、活动确认和必要的服务跟进，不用于与服务无关的画像或广告投放。</p>
        <h2>存储与访问</h2>
        <p>生产环境的数据存储、访问权限、保留期限和删除方式将在咨询接口上线前补充，并以届时发布的版本为准。</p>
        <h2>联系我们</h2>
        <p>如需查询、更正或删除已提交的信息，请通过 <NuxtLink to="/contact">联系页面</NuxtLink> 与看乐艺术沟通。</p>
      </article>
    </section>
  </div>
</template>
