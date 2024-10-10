<template>
    <view class="slogan">
        <view class="slogan-content">
            <view class="slogan-title">看乐艺术</view>
            <view class="slogan-subtitle">提高歌唱水平 · 提升音乐认知</view>
        </view>
    </view>
</template>

<script>
export default {};
</script>

<style lang="scss">
.slogan {
    width: 100%;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--background-color);
    color: var(--text-color);
}

.slogan-content {
    text-align: center;
    padding-bottom: 64px;
}

.slogan-title {
    font-size: 2.5rem;
    line-height: 0.8;
    font-weight: bold;
    margin-bottom: 20px;
    letter-spacing: 0.65em;
    padding-left: 0.65em;
}

.slogan-subtitle {
    font-size: 0.8rem;
    line-height: 1rem;
    letter-spacing: 0.4em;
    padding-left: 0.4em;
    font-family: 'Times New Roman', Times, serif;
}

@media (prefers-color-scheme: light) {
    :root {
        --background-color: #ffffff;
        --text-color: #000000;
    }
}

@media (prefers-color-scheme: dark) {
    :root {
        --background-color: #000000;
        --text-color: #ffffff;
    }
}
</style>
