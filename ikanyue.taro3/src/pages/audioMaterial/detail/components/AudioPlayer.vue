<template>
    <view class="audio-player">
        <view class="player-controls">
            <view class="player-btn secondary" @tap="handleRewind">
                <nut-icon name="left" size="16" color="#666666" />
            </view>

            <view class="player-btn primary" @tap="togglePlay" :class="{ playing: isPlaying }">
                <nut-icon :name="isPlaying ? 'pause' : 'play-start'" size="24" color="#ffffff" />
            </view>

            <view class="player-btn secondary" @tap="handleForward">
                <nut-icon name="right" size="16" color="#666666" />
            </view>
        </view>

        <view class="player-progress">
            <slider
                :value="currentTime"
                :max="duration"
                @changing="onSliderDrag"
                @change="onSliderRelease"
                :step="1"
                activeColor="#ff4949"
                backgroundColor="#e5e5e5"
                :disabled="!audioSource"
                :show-value="false"
                block-color="#ff4949"
                block-size="16"
            />
            <view class="player-time">
                <text>{{ formatTime(currentTime) }}</text>
                <text>{{ formatTime(duration) }}</text>
            </view>
        </view>

        <!-- 播放速度控制 -->
        <view class="player-controls-extra">
            <view class="speed-control">
                <view class="speed-options">
                    <text
                        v-for="speed in speedOptions"
                        :key="speed"
                        :class="['speed-option', { active: playbackRate === speed }]"
                        @tap="changePlaybackRate(speed)"
                    >
                        {{ speed }}x
                    </text>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import Taro from '@tarojs/taro';

// Props
const props = defineProps({
    audioSource: {
        type: String,
        default: '',
    },
    duration: {
        type: Number,
        default: 0,
    },
});

// Emits
const emit = defineEmits(['timeUpdate']);

// 响应式数据
const audioContext = ref(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const playTimer = ref(null);
const playbackRate = ref(1);
const isDragging = ref(false);

// 配置选项
const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

// 生命周期
onMounted(() => {
    initAudioContext();
});

onUnmounted(() => {
    if (audioContext.value) {
        audioContext.value.stop();
        clearPlayTimer();
    }
});

// 监听音频源变化
watch(
    () => props.audioSource,
    (newSource) => {
        if (audioContext.value && newSource) {
            audioContext.value.src = newSource;
        }
    }
);

// 方法
const initAudioContext = () => {
    try {
        audioContext.value = Taro.createInnerAudioContext();

        audioContext.value.onCanplay(() => {
            console.log('音频可以播放');
        });

        audioContext.value.onPlay(() => {
            console.log('音频开始播放');
            isPlaying.value = true;
            startPlayTimer();
        });

        audioContext.value.onPause(() => {
            console.log('音频暂停播放');
            isPlaying.value = false;
            clearPlayTimer();
        });

        audioContext.value.onStop(() => {
            console.log('音频停止播放');
            isPlaying.value = false;
            currentTime.value = 0;
            clearPlayTimer();
        });

        audioContext.value.onEnded(() => {
            console.log('音频播放结束');
            isPlaying.value = false;
            currentTime.value = 0;
            clearPlayTimer();
        });

        audioContext.value.onError((err) => {
            console.error('音频播放错误:', err);
            Taro.showToast({
                title: '音频播放错误',
                icon: 'none',
                duration: 2000,
            });
            isPlaying.value = false;
            clearPlayTimer();
        });

        audioContext.value.onTimeUpdate(() => {
            if (!isDragging.value) {
                currentTime.value = audioContext.value.currentTime || 0;
                emit('timeUpdate', currentTime.value);
            }
        });

        // 设置音频源
        if (props.audioSource) {
            audioContext.value.src = props.audioSource;
        }
    } catch (err) {
        console.error('初始化音频上下文失败:', err);
    }
};

const togglePlay = () => {
    if (!props.audioSource) {
        Taro.showToast({
            title: '音频资源不可用',
            icon: 'none',
            duration: 2000,
        });
        return;
    }

    try {
        if (isPlaying.value) {
            audioContext.value.pause();
        } else {
            if (!audioContext.value.src) {
                audioContext.value.src = props.audioSource;
            }
            audioContext.value.play();
        }
    } catch (err) {
        console.error('播放控制错误:', err);
        Taro.showToast({
            title: '播放失败',
            icon: 'none',
            duration: 2000,
        });
    }
};

const handleRewind = () => {
    if (!audioContext.value) return;
    const newTime = Math.max(0, currentTime.value - 10);
    audioContext.value.seek(newTime);
    currentTime.value = newTime;
};

const handleForward = () => {
    if (!audioContext.value) return;
    const newTime = Math.min(props.duration, currentTime.value + 10);
    audioContext.value.seek(newTime);
    currentTime.value = newTime;
};

const onSliderDrag = (e) => {
    if (!audioContext.value) return;
    const time = e.detail.value;
    isDragging.value = true;
    currentTime.value = time;
};

const onSliderRelease = (e) => {
    if (!audioContext.value) return;
    const time = e.detail.value;
    audioContext.value.seek(time);
    currentTime.value = time;
    isDragging.value = false;
};

const changePlaybackRate = (rate) => {
    playbackRate.value = rate;
    if (audioContext.value) {
        audioContext.value.playbackRate = rate;
    }
};

const startPlayTimer = () => {
    clearPlayTimer();
    playTimer.value = setInterval(() => {
        if (audioContext.value && isPlaying.value && !isDragging.value) {
            currentTime.value = audioContext.value.currentTime || 0;
            emit('timeUpdate', currentTime.value);
        }
    }, 1000);
};

const clearPlayTimer = () => {
    if (playTimer.value) {
        clearInterval(playTimer.value);
        playTimer.value = null;
    }
};

const formatTime = (seconds) => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};
</script>

<style lang="scss" scoped>
.audio-player {
    margin: -40px 16px 0;
    background-color: #fff;
    border-radius: 16px;
    padding: 20px;
    position: relative;
    z-index: 10;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.player-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 24px;
    margin: 20px 0;
}

.player-btn {
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: all 0.2s ease;

    &.secondary {
        width: 48px;
        height: 48px;
        background-color: #f5f5f5;

        &:active {
            transform: scale(0.95);
            background-color: #e8e8e8;
        }
    }

    &.primary {
        width: 72px;
        height: 72px;
        background: linear-gradient(135deg, #ff6b6b, #ff4949);
        box-shadow: 0 4px 12px rgba(255, 73, 73, 0.3);

        &:active {
            transform: scale(0.95);
        }

        &.playing {
            background: linear-gradient(135deg, #4ecdc4, #44a08d);
            box-shadow: 0 4px 12px rgba(68, 160, 141, 0.3);
        }
    }
}

.player-progress {
    margin: 20px 0;

    slider {
        width: 100%;
        height: 4px;
        margin: 10px 0;
    }

    slider::after,
    slider::before {
        display: none !important;
    }
}

.player-time {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #999;
    margin-top: 8px;
}

.player-controls-extra {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #f0f0f0;
}

.speed-control {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.speed-options {
    display: flex;
    gap: 8px;
}

.speed-option {
    padding: 4px 12px;
    font-size: 12px;
    background-color: #f5f5f5;
    color: #666;
    border-radius: 16px;
    transition: all 0.2s ease;

    &.active {
        background-color: #ff4949;
        color: #fff;
    }

    &:active {
        transform: scale(0.95);
    }
}
</style>
