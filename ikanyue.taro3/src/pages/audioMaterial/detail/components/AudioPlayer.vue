<template>
    <view class="audio-player">
        <!-- 播放控制 -->
        <view class="player-controls">
            <view class="player-btn secondary" @tap="handleRewind" :class="{ disabled: !isReady }">
                <nut-icon name="play-double-back" size="16" color="#666666" />
            </view>

            <view
                class="player-btn primary"
                @tap="togglePlay"
                :class="{
                    playing: isPlaying,
                    disabled: !isReady,
                }"
            >
                <nut-icon :name="isPlaying ? 'play-stop' : 'play-start'" size="24" color="#ffffff" />
            </view>

            <view class="player-btn secondary" @tap="handleForward" :class="{ disabled: !isReady }">
                <nut-icon name="play-double-forward" size="16" color="#666666" />
            </view>
        </view>

        <!-- 进度条 -->
        <view class="player-progress">
            <slider
                :value="currentTime"
                :max="duration || 1"
                @changing="onSliderDrag"
                @change="onSliderRelease"
                :step="1"
                activeColor="#ff4949"
                backgroundColor="#e5e5e5"
                :disabled="!duration || duration === 0"
                :show-value="false"
                block-color="#ff4949"
                block-size="16"
            />
            <view class="player-time">
                <text>{{ formatTime(currentTime) }}</text>
                <text>{{ formatTime(duration) }}</text>
            </view>
        </view>
    </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import Taro from '@tarojs/taro';

// Props
const props = defineProps({
    audioSourceUrl: {
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
const duration = ref(0);
const isDragging = ref(false);
const isReady = ref(false);
const usingTaroAudio = ref(false);
const debugMode = ref(false);

// Taro音频进度定时器
let taroProgressTimer = null;

// 工具方法
const formatTime = (seconds) => {
    if (seconds === 0) return '00:00'; // 0秒时显示00:00
    if (!seconds || isNaN(seconds)) return '--';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// 初始化音频
const initAudio = () => {
    if (!props.audioSourceUrl) {
        console.warn('AudioPlayer: 音频URL未提供');
        return;
    }

    // 标记为准备就绪，允许用户点击播放
    isReady.value = true;
    console.log('AudioPlayer: 初始化完成，等待用户播放');

    // 预创建音频上下文来获取时长信息
    setTimeout(() => {
        preloadAudioInfo();
    }, 500);
};

// 预加载音频信息（仅获取时长，不播放）
const preloadAudioInfo = () => {
    try {
        if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
            console.warn('AudioPlayer: 微信环境不可用，无法预加载时长');
            return;
        }

        console.log('AudioPlayer: 开始预加载音频信息');
        const tempAudio = wx.createInnerAudioContext();
        if (!tempAudio) return;

        tempAudio.src = props.audioSourceUrl;
        tempAudio.autoplay = false;

        // 监听能够获取时长的事件
        tempAudio.onCanplay(() => {
            const audioDuration = tempAudio.duration;
            if (audioDuration && audioDuration > 0) {
                duration.value = audioDuration;
                console.log('AudioPlayer: 预加载获取时长成功', audioDuration);
            }
            // 销毁临时音频上下文
            try {
                tempAudio.destroy();
            } catch (e) {
                // 静默处理
            }
        });

        tempAudio.onError(() => {
            console.warn('AudioPlayer: 预加载音频失败');
            try {
                tempAudio.destroy();
            } catch (e) {
                // 静默处理
            }
        });

        // 3秒后强制销毁
        setTimeout(() => {
            try {
                tempAudio.destroy();
            } catch (e) {
                // 静默处理
            }
        }, 3000);
    } catch (error) {
        console.error('AudioPlayer: 预加载音频信息失败', error);
    }
};

// 创建音频上下文（延迟到播放时）
const createAudioContext = () => {
    try {
        if (audioContext.value) return true;

        console.log('AudioPlayer: 开始创建音频上下文');
        audioContext.value = wx.createInnerAudioContext();
        if (!audioContext.value) {
            console.error('AudioPlayer: 音频上下文创建失败');
            return false;
        }

        // 先设置音频源
        audioContext.value.src = props.audioSourceUrl;

        // 安全地设置其他属性
        try {
            if (typeof audioContext.value.autoplay !== 'undefined') {
                audioContext.value.autoplay = false;
            }
        } catch (e) {
            console.warn('AudioPlayer: 设置autoplay失败', e);
        }

        try {
            if (typeof audioContext.value.loop !== 'undefined') {
                audioContext.value.loop = false;
            }
        } catch (e) {
            console.warn('AudioPlayer: 设置loop失败', e);
        }

        try {
            if (typeof audioContext.value.volume !== 'undefined') {
                audioContext.value.volume = 1.0;
            }
        } catch (e) {
            console.warn('AudioPlayer: 设置volume失败', e);
        }

        setupAudioEvents();
        console.log('AudioPlayer: 音频上下文创建成功');
        return true;
    } catch (error) {
        console.error('AudioPlayer: 创建音频上下文失败', error);
        return false;
    }
};

// 设置音频事件
const setupAudioEvents = () => {
    if (!audioContext.value) return;

    // 获取时长
    audioContext.value.onCanplay(() => {
        isReady.value = true;
        const audioDuration = audioContext.value.duration;
        if (audioDuration && audioDuration > 0) {
            duration.value = audioDuration;
        }
    });

    // 播放状态
    audioContext.value.onPlay(() => {
        isPlaying.value = true;
    });

    audioContext.value.onPause(() => {
        isPlaying.value = false;
    });

    audioContext.value.onEnded(() => {
        isPlaying.value = false;
        currentTime.value = 0;
        console.log('AudioPlayer: 播放结束，重置到开始位置');
        // 不销毁音频上下文，保持可用状态以便重新播放
        // 重置音频到开始位置
        try {
            if (audioContext.value && typeof audioContext.value.seek === 'function') {
                audioContext.value.seek(0);
            }
        } catch (error) {
            console.warn('AudioPlayer: 重置播放位置失败', error);
        }
    });

    // 时间更新
    audioContext.value.onTimeUpdate(() => {
        if (!isDragging.value) {
            const current = audioContext.value.currentTime || 0;
            if (!isNaN(current) && current >= 0) {
                currentTime.value = current;
                emit('timeUpdate', current);
            }
        }
    });

    // 错误处理
    audioContext.value.onError((error) => {
        console.error('AudioPlayer: 音频错误', error);
        isReady.value = false;
        isPlaying.value = false;
        // 发生错误时重置音频上下文
        resetAudioContext();
        // 尝试Taro音频
        if (!usingTaroAudio.value) {
            tryTaroAudio();
        }
    });
};

// 新增：重置音频上下文
const resetAudioContext = () => {
    try {
        if (audioContext.value) {
            audioContext.value.destroy();
            audioContext.value = null;
        }
    } catch (error) {
        console.warn('AudioPlayer: 重置音频上下文失败', error);
    }
};

// 播放/暂停
const togglePlay = () => {
    try {
        if (usingTaroAudio.value) {
            if (isPlaying.value) {
                Taro.pauseBackgroundAudio();
            } else {
                // 检查是否需要从头开始播放
                const shouldRestart =
                    currentTime.value === 0 || (duration.value && currentTime.value >= duration.value - 1);

                if (shouldRestart) {
                    console.log('AudioPlayer: Taro音频从头开始播放');
                    currentTime.value = 0;
                    emit('timeUpdate', 0);
                }

                Taro.playBackgroundAudio({
                    dataUrl: props.audioSourceUrl,
                    title: '音频播放',
                    startTime: shouldRestart ? 0 : currentTime.value,
                    success: () => {
                        console.log('AudioPlayer: Taro播放成功', shouldRestart ? '(从头开始)' : '(继续播放)');
                        isPlaying.value = true;
                    },
                    fail: (error) => {
                        console.error('AudioPlayer: Taro播放失败', error);
                        // 播放失败时重置状态
                        isReady.value = false;
                        usingTaroAudio.value = false;
                    },
                });
            }
            return;
        }

        // 检查微信环境
        if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
            console.warn('AudioPlayer: 微信环境不可用，使用Taro音频');
            tryTaroAudio();
            return;
        }

        // 如果音频上下文不存在或已销毁，重新创建
        if (!audioContext.value) {
            console.log('AudioPlayer: 音频上下文不存在，重新创建');
            if (!createAudioContext()) {
                console.warn('AudioPlayer: 重新创建失败，使用Taro音频');
                tryTaroAudio();
                return;
            }
        }

        if (isPlaying.value) {
            if (audioContext.value && typeof audioContext.value.pause === 'function') {
                audioContext.value.pause();
            } else {
                console.warn('AudioPlayer: pause方法不可用');
                isPlaying.value = false;
            }
        } else {
            // 检查音频是否已经结束或接近结束，如果是则从头开始播放
            const shouldRestart =
                currentTime.value === 0 || (duration.value && currentTime.value >= duration.value - 1);

            if (shouldRestart) {
                console.log('AudioPlayer: 从头开始播放');
                try {
                    if (audioContext.value && typeof audioContext.value.seek === 'function') {
                        audioContext.value.seek(0);
                    }
                    currentTime.value = 0;
                    emit('timeUpdate', 0);
                } catch (seekError) {
                    console.warn('AudioPlayer: 重置播放位置失败', seekError);
                }
            }

            if (audioContext.value && typeof audioContext.value.play === 'function') {
                audioContext.value.play();
                console.log('AudioPlayer: 开始播放', shouldRestart ? '(从头开始)' : '(继续播放)');
            } else {
                console.warn('AudioPlayer: play方法不可用，使用Taro音频');
                tryTaroAudio();
            }
        }
    } catch (error) {
        console.error('AudioPlayer: 播放操作失败', error);
        if (!usingTaroAudio.value) {
            console.warn('AudioPlayer: 切换到Taro音频');
            tryTaroAudio();
        }
    }
};

// 快退
const handleRewind = () => {
    if (!isReady.value) return;

    const newTime = Math.max(0, currentTime.value - 10);
    console.log('AudioPlayer: 快退到', newTime);
    seekToTime(newTime);
};

// 快进
const handleForward = () => {
    if (!isReady.value) return;

    const newTime = Math.min(duration.value || 999999, currentTime.value + 10);
    console.log('AudioPlayer: 快进到', newTime);
    seekToTime(newTime);
};

// 跳转到指定时间
const seekToTime = (time) => {
    currentTime.value = time; // 立即更新UI
    emit('timeUpdate', time); // 立即通知父组件

    if (usingTaroAudio.value) {
        try {
            Taro.seekBackgroundAudio({
                position: time,
                success: () => {
                    console.log('AudioPlayer: Taro跳转成功', time);
                },
                fail: (error) => {
                    console.warn('AudioPlayer: Taro跳转失败', error);
                },
            });
        } catch (error) {
            console.warn('AudioPlayer: Taro跳转失败', error);
        }
    } else if (audioContext.value) {
        try {
            if (typeof audioContext.value.seek === 'function') {
                audioContext.value.seek(time);
                console.log('AudioPlayer: 原生跳转成功', time);
            } else {
                console.warn('AudioPlayer: seek方法不可用');
            }
        } catch (error) {
            console.warn('AudioPlayer: 原生跳转失败', error);
        }
    }
};

// 滑块拖动
const onSliderDrag = (e) => {
    isDragging.value = true;
    currentTime.value = e.detail.value;
    if (usingTaroAudio.value) {
        stopTaroProgressTimer();
    }
};

// 滑块释放
const onSliderRelease = (e) => {
    isDragging.value = false;
    const time = e.detail.value;
    console.log('AudioPlayer: 滑块跳转到', time);
    seekToTime(time);

    // 如果使用Taro音频，重启定时器
    if (usingTaroAudio.value && isPlaying.value) {
        setTimeout(() => {
            startTaroProgressTimer();
        }, 500);
    }
};

// 使用Taro音频
const tryTaroAudio = () => {
    try {
        console.log('AudioPlayer: 切换到Taro音频模式');
        usingTaroAudio.value = true;
        isReady.value = true;

        // 设置监听器（如果尚未设置）
        setupTaroAudioListeners();

        // 触发播放逻辑
        togglePlay();
    } catch (error) {
        console.error('AudioPlayer: Taro音频初始化失败', error);
        isReady.value = false;
        usingTaroAudio.value = false;
    }
};

// 设置Taro音频监听器
const setupTaroAudioListeners = () => {
    Taro.onBackgroundAudioPlay(() => {
        isPlaying.value = true;
        startTaroProgressTimer();
    });

    Taro.onBackgroundAudioPause(() => {
        isPlaying.value = false;
        stopTaroProgressTimer();
    });

    Taro.onBackgroundAudioStop(() => {
        isPlaying.value = false;
        currentTime.value = 0;
        stopTaroProgressTimer();
        console.log('AudioPlayer: Taro音频停止，重置到开始位置');
        // 保持 usingTaroAudio 标记，允许重新播放
        emit('timeUpdate', 0);
    });
};

// Taro音频进度定时器
const startTaroProgressTimer = () => {
    stopTaroProgressTimer();
    taroProgressTimer = setInterval(() => {
        if (usingTaroAudio.value && isPlaying.value && !isDragging.value) {
            Taro.getBackgroundAudioPlayerState({
                success: (res) => {
                    if (res && res.status === 1) {
                        const newTime = res.currentPosition || 0;
                        if (newTime >= 0 && !isNaN(newTime)) {
                            currentTime.value = newTime;
                            emit('timeUpdate', currentTime.value);
                        }
                        if (res.duration && res.duration > 0) {
                            duration.value = res.duration;
                        }
                    }
                },
                fail: () => {
                    // 静默失败
                },
            });
        }
    }, 1000);
};

const stopTaroProgressTimer = () => {
    if (taroProgressTimer) {
        clearInterval(taroProgressTimer);
        taroProgressTimer = null;
    }
};

// 销毁
const destroy = () => {
    stopTaroProgressTimer();

    if (usingTaroAudio.value) {
        try {
            Taro.stopBackgroundAudio();
        } catch (error) {
            // 静默处理
        }
    }

    if (audioContext.value) {
        try {
            audioContext.value.destroy();
        } catch (error) {
            // 静默处理
        }
        audioContext.value = null;
    }

    // 重置状态
    isPlaying.value = false;
    isReady.value = false;
    currentTime.value = 0;
    duration.value = 0;
    isDragging.value = false;
    usingTaroAudio.value = false;
};

// 生命周期
onMounted(() => {
    console.log('AudioPlayer: 组件挂载');
    nextTick(() => {
        initAudio(); // 只做基本初始化，不创建音频上下文
        setupTaroAudioListeners();
    });
});

onUnmounted(() => {
    console.log('AudioPlayer: 组件卸载');
    destroy();
    try {
        Taro.offBackgroundAudioPlay();
        Taro.offBackgroundAudioPause();
        Taro.offBackgroundAudioStop();
    } catch (e) {
        // 静默处理
    }
});
</script>

<style lang="scss" scoped src="./AudioPlayer.scss"></style>
