<script setup lang="ts">
useSeoMeta({ title: '隐私说明', description: '看乐艺术官网隐私与数据使用说明。' })
</script>

<template>
  <div>
    <LayoutPageHero title="隐私说明" description="官网只展示公开课程与活动信息，不在站内直接提交咨询资料。" compact />
    <section class="section-band">
      <article class="site-container prose-page">
        <h2>官网信息范围</h2>
        <p>本网站用于展示看乐艺术的声乐课程、教学方法与公开活动。当前站内不设置姓名、手机号或学习经历的提交表单。</p>
        <h2>微信咨询</h2>
        <p>当你按照联系页面的说明前往微信咨询时，相关账号信息和主动发送的内容会在微信服务内处理。请只提供完成课程沟通所必需的信息。</p>
        <h2>公开活动数据</h2>
        <p>活动列表可能从看乐艺术的公开服务读取时间、地点、封面与参与说明，这些内容不包含学员个人资料。</p>
        <h2>你的选择</h2>
        <p>你可以在正式咨询前仅浏览公开页面。对于已经通过微信提交的信息，可通过同一咨询渠道提出查询、更正或删除请求。</p>
        <h2>联系我们</h2>
        <p>需要进一步了解信息处理方式时，请前往 <NuxtLink to="/contact">联系页面</NuxtLink>，按页面说明与看乐艺术沟通。</p>
      </article>
    </section>
  </div>
</template>
