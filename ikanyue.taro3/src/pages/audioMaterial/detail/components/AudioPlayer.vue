<template>
    <view class="audio-player">
        <!-- 调试信息 -->
        <view v-if="debugMode" class="debug-info">
            <text>播放状态: {{ isPlaying ? '播放中' : '已暂停' }}</text>
            <text>当前时间: {{ currentTime }}s</text>
            <text>音频时长: {{ duration }}s</text>
            <text>音频源: {{ props.audioSourceUrl ? '已设置' : '未设置' }}</text>
            <text>播放器就绪: {{ isReady ? '是' : '否' }}</text>
        </view>

        <view class="player-controls">
            <view class="player-btn secondary" @tap="handleRewind" :class="{ disabled: !isReady && !usingTaroAudio }">
                <nut-icon name="play-double-back" size="16" color="#666666" />
            </view>

            <view
                class="player-btn primary"
                @tap="togglePlay"
                :class="{
                    playing: isPlaying,
                    disabled: !isReady && !usingTaroAudio,
                }"
            >
                <nut-icon :name="isPlaying ? 'play-stop' : 'play-start'" size="24" color="#ffffff" />
            </view>

            <view class="player-btn secondary" @tap="handleForward" :class="{ disabled: !isReady && !usingTaroAudio }">
                <nut-icon name="play-double-forward" size="16" color="#666666" />
            </view>
        </view>

        <!-- 进度条：始终显示，时长为0时显示"--" -->
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
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
const usingTaroAudio = ref(false); // 标记是否使用Taro音频API
const debugMode = ref(false); // 调试模式
const isOperating = ref(false); // 操作锁，防止快退快进时的状态冲突

// Taro音频进度定时器
let taroProgressTimer = null;
let lastUpdateTime = 0;
let isSeekingActive = false;

// 方法定义
const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '--';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// 新增：平滑跳转方法，避免停止重播造成的闪动
const seekToTimeSmooth = (time) => {
    const wasPlaying = isPlaying.value;

    // 立即设置目标时间，防止UI闪动
    currentTime.value = time;
    lastUpdateTime = time;

    // 暂停进度更新，防止被覆盖
    stopTaroProgressTimer();
    isSeekingActive = true;

    try {
        // 首先尝试直接跳转
        Taro.seekBackgroundAudio({
            position: time,
            success: () => {
                // 跳转成功，恢复正常状态
                isSeekingActive = false;
                isOperating.value = false;

                if (wasPlaying && isPlaying.value) {
                    // 延迟启动定时器，确保跳转完成
                    setTimeout(() => {
                        startTaroProgressTimer();
                    }, 300);
                }
            },
            fail: (error) => {
                // 直接跳转失败，尝试温和的方式
                handleSeekFallback(time, wasPlaying);
            },
        });
    } catch (error) {
        // API调用失败，使用fallback
        handleSeekFallback(time, wasPlaying);
    }
};

// 新增：跳转失败时的温和处理方式
const handleSeekFallback = (time, wasPlaying) => {
    if (!wasPlaying) {
        // 如果当前是暂停状态，可以安全地重播
        Taro.playBackgroundAudio({
            dataUrl: props.audioSourceUrl,
            title: '音频播放',
            success: () => {
                // 播放成功后尝试跳转
                setTimeout(() => {
                    trySeekAfterPlay(time);
                }, 200);
            },
            fail: () => {
                // 播放失败，保持UI状态
                isSeekingActive = false;
                isOperating.value = false;
            },
        });
    } else {
        // 如果正在播放，保持当前状态，只更新UI
        // 这样避免了停止重播造成的闪动
        isSeekingActive = false;
        isOperating.value = false;

        // 重启定时器，让音频继续自然播放
        setTimeout(() => {
            if (isPlaying.value) {
                startTaroProgressTimer();
            }
        }, 500);

        // 显示提示，让用户知道跳转可能不精确
        // Taro.showToast({
        //     title: '跳转完成',
        //     icon: 'none',
        //     duration: 1000,
        // });
    }
};

// 新增：播放后尝试跳转的辅助方法
const trySeekAfterPlay = (time) => {
    try {
        Taro.seekBackgroundAudio({
            position: time,
            success: () => {
                currentTime.value = time;
                lastUpdateTime = time;
                isSeekingActive = false;
                isOperating.value = false;

                if (isPlaying.value) {
                    startTaroProgressTimer();
                }
            },
            fail: () => {
                // 最终失败，保持当前状态
                isSeekingActive = false;
                isOperating.value = false;

                if (isPlaying.value) {
                    startTaroProgressTimer();
                }
            },
        });
    } catch (error) {
        isSeekingActive = false;
        isOperating.value = false;

        if (isPlaying.value) {
            startTaroProgressTimer();
        }
    }
};

const initAudio = () => {
    if (!props.audioSourceUrl) {
        console.warn('AudioPlayer: 音频URL未提供');
        return;
    }

    // 先设置基本状态，允许用户点击播放
    isReady.value = true;

    // 不再在初始化时设置props时长，等待获取实际时长
    // duration.value = 0; // 保持为0，显示"--"

    try {
        // 检查微信小程序环境
        if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
            console.warn('AudioPlayer: 微信小程序环境未检测到或API不可用');
            return;
        }

        // 立即创建预加载音频上下文来获取时长
        createPreloadAudioContext();
    } catch (error) {
        console.error('AudioPlayer: 初始化检查失败', error);
    }
};

// 新增：创建预加载音频上下文来快速获取时长
const createPreloadAudioContext = () => {
    try {
        if (!props.audioSourceUrl) return;

        console.log('AudioPlayer: 创建预加载音频上下文获取时长');

        // 如果audioContext还不存在，直接创建作为预加载
        if (!audioContext.value) {
            audioContext.value = wx.createInnerAudioContext();

            if (!audioContext.value) {
                console.error('AudioPlayer: 预加载音频上下文创建失败');
                return;
            }

            // 基本设置 - 确保不自动播放
            audioContext.value.autoplay = false;
            audioContext.value.loop = false;
            audioContext.value.volume = 1.0;
            audioContext.value.src = props.audioSourceUrl;

            console.log('AudioPlayer: 预加载音频上下文创建成功，开始监听事件');

            // 设置预加载事件监听器（专门用于获取时长）
            setupPreloadEvents();
        }
    } catch (error) {
        console.error('AudioPlayer: 创建预加载音频上下文失败', error);
    }
};

// 简化预加载事件监听器
const setupPreloadEvents = () => {
    if (!audioContext.value) return;

    let durationObtained = false;

    const updateDuration = () => {
        if (durationObtained) return;

        try {
            const audioDuration = audioContext.value.duration;
            if (audioDuration && audioDuration > 0 && !isNaN(audioDuration)) {
                duration.value = audioDuration;
                durationObtained = true;
                console.log('AudioPlayer: 获取音频实际时长成功', audioDuration);

                // 获取到时长后，准备播放事件监听器
                setTimeout(() => {
                    setupPlaybackEvents();
                }, 100);

                return true;
            }
        } catch (error) {
            console.warn('AudioPlayer: 获取时长失败', error);
        }
        return false;
    };

    // 监听关键事件
    if (typeof audioContext.value.onCanplay === 'function') {
        audioContext.value.onCanplay(() => {
            console.log('AudioPlayer: onCanplay');
            updateDuration();
        });
    }

    if (typeof audioContext.value.onLoadedmetadata === 'function') {
        audioContext.value.onLoadedmetadata(() => {
            console.log('AudioPlayer: onLoadedmetadata');
            updateDuration();
        });
    }

    // 简化的轮询检查
    const checkDuration = () => {
        if (!durationObtained && audioContext.value) {
            updateDuration();
            if (!durationObtained) {
                setTimeout(checkDuration, 1000); // 每1秒检查一次
            }
        }
    };

    // 1秒后开始检查
    setTimeout(checkDuration, 1000);
};

// 新增：设置播放相关的事件监听器
const setupPlaybackEvents = () => {
    if (!audioContext.value) return;

    console.log('AudioPlayer: 设置播放事件监听器');

    // 播放开始
    if (typeof audioContext.value.onPlay === 'function') {
        audioContext.value.onPlay(() => {
            isPlaying.value = true;
            console.log('AudioPlayer: 播放开始');
        });
    }

    // 播放暂停
    if (typeof audioContext.value.onPause === 'function') {
        audioContext.value.onPause(() => {
            isPlaying.value = false;
            console.log('AudioPlayer: 播放暂停');
        });
    }

    // 播放结束
    if (typeof audioContext.value.onEnded === 'function') {
        audioContext.value.onEnded(() => {
            isPlaying.value = false;
            currentTime.value = 0;
            console.log('AudioPlayer: 播放结束');
        });
    }

    // 时间更新
    if (typeof audioContext.value.onTimeUpdate === 'function') {
        audioContext.value.onTimeUpdate(() => {
            if (!isDragging.value) {
                try {
                    const current = audioContext.value.currentTime || 0;
                    if (!isNaN(current) && current >= 0) {
                        currentTime.value = current;
                        emit('timeUpdate', current);
                    }
                } catch (timeError) {
                    console.warn('AudioPlayer: 时间更新失败', timeError);
                }
            }
        });
    }

    // 等待缓冲
    if (typeof audioContext.value.onWaiting === 'function') {
        audioContext.value.onWaiting(() => {
            console.log('AudioPlayer: 缓冲中...');
        });
    }
};

// 简化原有的创建音频上下文方法（现在主要用于播放时的备用创建）
const createAudioContext = () => {
    try {
        if (audioContext.value) {
            // 如果已经存在，确保设置了播放事件监听器
            setupPlaybackEvents();
            return true;
        }

        // 创建新的音频上下文
        audioContext.value = wx.createInnerAudioContext();

        if (!audioContext.value) {
            console.error('AudioPlayer: 音频上下文创建失败');
            return false;
        }

        // 基本设置
        audioContext.value.autoplay = false;
        audioContext.value.loop = false;
        audioContext.value.volume = 1.0;
        audioContext.value.src = props.audioSourceUrl;

        // 设置完整的事件监听器
        setupAudioEvents();

        console.log('AudioPlayer: 音频上下文创建成功');
        return true;
    } catch (error) {
        console.error('AudioPlayer: 创建音频上下文失败', error);
        return false;
    }
};

// 保持原有的确保音频上下文方法不变
const ensureAudioContext = () => {
    try {
        // 如果音频上下文已存在且可用，直接返回
        if (audioContext.value && audioContext.value.src) {
            return true;
        }

        // 如果不存在或不可用，尝试创建
        return createAudioContext();
    } catch (error) {
        console.error('AudioPlayer: 确保音频上下文失败', error);
        return false;
    }
};

const togglePlay = () => {
    try {
        // 如果正在使用Taro音频API
        if (usingTaroAudio.value) {
            try {
                if (isPlaying.value) {
                    Taro.pauseBackgroundAudio();
                } else {
                    if (!props.audioSourceUrl) {
                        Taro.showToast({
                            title: '音频地址无效',
                            icon: 'none',
                            duration: 2000,
                        });
                        return;
                    }

                    Taro.playBackgroundAudio({
                        dataUrl: props.audioSourceUrl,
                        title: '音频播放',
                        success: () => {
                            console.log('AudioPlayer: Taro音频播放成功');
                        },
                        fail: (error) => {
                            console.error('AudioPlayer: Taro音频播放失败', error);
                            Taro.showToast({
                                title: '播放失败，请重试',
                                icon: 'none',
                                duration: 2000,
                            });
                        },
                    });
                }
            } catch (taroError) {
                console.error('AudioPlayer: Taro音频操作失败', taroError);
                Taro.showToast({
                    title: '操作失败',
                    icon: 'none',
                    duration: 1000,
                });
            }
            return;
        }

        // 确保音频上下文可用
        if (!ensureAudioContext()) {
            console.warn('AudioPlayer: 音频上下文不可用，切换到Taro音频');
            tryTaroAudio();
            return;
        }

        // 执行播放/暂停操作
        try {
            if (isPlaying.value) {
                // 暂停播放
                if (audioContext.value && typeof audioContext.value.pause === 'function') {
                    audioContext.value.pause();
                } else {
                    console.warn('AudioPlayer: pause方法不可用');
                    isPlaying.value = false;
                }
            } else {
                // 开始播放
                if (!audioContext.value) {
                    console.warn('AudioPlayer: 音频上下文不存在，切换到Taro音频');
                    tryTaroAudio();
                    return;
                }

                // 确保音频源正确设置
                if (!audioContext.value.src || audioContext.value.src !== props.audioSourceUrl) {
                    audioContext.value.src = props.audioSourceUrl;
                }

                // 确保音量设置
                if (typeof audioContext.value.volume !== 'undefined') {
                    audioContext.value.volume = 1;
                }

                // 检查play方法是否存在
                if (typeof audioContext.value.play !== 'function') {
                    console.warn('AudioPlayer: play方法不可用，切换到Taro音频');
                    tryTaroAudio();
                    return;
                }

                // 执行播放
                audioContext.value.play();

                // 延迟检查播放状态
                setTimeout(() => {
                    if (audioContext.value && !isPlaying.value) {
                        // 检查是否真的在播放
                        try {
                            const paused = audioContext.value.paused;
                            if (paused !== false) {
                                console.warn('AudioPlayer: 播放可能失败，尝试备用方法');
                                // 尝试重新播放
                                if (typeof audioContext.value.play === 'function') {
                                    audioContext.value.play();
                                }

                                // 如果还是失败，切换到Taro音频
                                setTimeout(() => {
                                    if (audioContext.value && audioContext.value.paused !== false) {
                                        console.warn('AudioPlayer: 原生播放失败，切换到Taro音频');
                                        tryTaroAudio();
                                    }
                                }, 1000);
                            }
                        } catch (checkError) {
                            console.error('AudioPlayer: 播放状态检查失败', checkError);
                            tryTaroAudio();
                        }
                    }
                }, 1000);
            }
        } catch (playError) {
            console.error('AudioPlayer: 播放操作失败', playError);

            // 播放失败时尝试Taro音频
            if (!usingTaroAudio.value) {
                console.warn('AudioPlayer: 原生播放失败，切换到Taro音频');
                tryTaroAudio();
            } else {
                Taro.showToast({
                    title: '播放失败: ' + (playError.message || '未知错误'),
                    icon: 'none',
                    duration: 2000,
                });
            }
        }
    } catch (error) {
        console.error('AudioPlayer: togglePlay方法执行失败', error);

        // 最后的兜底处理
        if (!usingTaroAudio.value) {
            console.warn('AudioPlayer: 执行失败，尝试Taro音频');
            tryTaroAudio();
        } else {
            Taro.showToast({
                title: '播放器出现错误，请重试',
                icon: 'none',
                duration: 2000,
            });
        }
    }
};

const handleRewind = () => {
    if (isOperating.value) return; // 防止重复操作

    try {
        const newTime = Math.max(0, currentTime.value - 10);

        if (usingTaroAudio.value) {
            // 立即更新UI，防止闪动
            isOperating.value = true;
            currentTime.value = newTime;
            emit('timeUpdate', newTime);
            seekToTimeSmooth(newTime);
            return;
        }

        // 确保音频上下文可用
        if (!ensureAudioContext()) {
            console.warn('AudioPlayer: 快退失败，音频播放器不可用');
            return;
        }

        try {
            if (typeof audioContext.value.seek === 'function') {
                audioContext.value.seek(newTime);
                currentTime.value = newTime;
                emit('timeUpdate', newTime);
            } else {
                console.warn('AudioPlayer: seek方法不可用');
            }
        } catch (seekError) {
            console.error('AudioPlayer: 快退操作失败', seekError);
        }
    } catch (error) {
        console.error('AudioPlayer: handleRewind执行失败', error);
        isOperating.value = false;
    }
};

const handleForward = () => {
    if (isOperating.value) return; // 防止重复操作

    try {
        const newTime = Math.min(duration.value, currentTime.value + 10);

        if (usingTaroAudio.value) {
            // 立即更新UI，防止闪动
            isOperating.value = true;
            currentTime.value = newTime;
            emit('timeUpdate', newTime);
            seekToTimeSmooth(newTime);
            return;
        }

        // 确保音频上下文可用
        if (!ensureAudioContext()) {
            console.warn('AudioPlayer: 快进失败，音频播放器不可用');
            return;
        }

        try {
            if (typeof audioContext.value.seek === 'function') {
                audioContext.value.seek(newTime);
                currentTime.value = newTime;
                emit('timeUpdate', newTime);
            } else {
                console.warn('AudioPlayer: seek方法不可用');
            }
        } catch (seekError) {
            console.error('AudioPlayer: 快进操作失败', seekError);
        }
    } catch (error) {
        console.error('AudioPlayer: handleForward执行失败', error);
        isOperating.value = false;
    }
};

const onSliderDrag = (e) => {
    try {
        if (!e || !e.detail || typeof e.detail.value !== 'number') {
            console.warn('AudioPlayer: 滑块拖动事件数据无效');
            return;
        }

        isDragging.value = true;
        isOperating.value = true; // 标记为操作中
        currentTime.value = e.detail.value;

        // 暂停所有自动更新
        if (usingTaroAudio.value) {
            stopTaroProgressTimer();
            isSeekingActive = true; // 标记为拖动状态，阻止所有自动更新
        }
    } catch (error) {
        console.error('AudioPlayer: onSliderDrag执行失败', error);
        isDragging.value = false;
        isOperating.value = false;
    }
};

const onSliderRelease = (e) => {
    try {
        if (!e || !e.detail || typeof e.detail.value !== 'number') {
            console.warn('AudioPlayer: 滑块释放事件数据无效');
            isDragging.value = false;
            isOperating.value = false;
            return;
        }

        const time = e.detail.value;
        isDragging.value = false;

        if (usingTaroAudio.value) {
            // 使用平滑跳转，避免闪动
            seekToTimeSmooth(time);
        } else if (ensureAudioContext()) {
            try {
                if (typeof audioContext.value.seek === 'function') {
                    audioContext.value.seek(time);
                    currentTime.value = time;
                    emit('timeUpdate', time);
                } else {
                    console.warn('AudioPlayer: seek方法不可用');
                }
            } catch (seekError) {
                console.error('AudioPlayer: 滑块跳转失败', seekError);
            }
            isOperating.value = false;
        } else {
            console.warn('AudioPlayer: 滑块跳转失败，音频播放器不可用');
            isOperating.value = false;
        }
    } catch (error) {
        console.error('AudioPlayer: onSliderRelease执行失败', error);
        isDragging.value = false;
        isOperating.value = false;
    }
};

const seekToTime = (time) => {
    const wasPlaying = isPlaying.value;

    try {
        Taro.seekBackgroundAudio({
            position: time,
            success: () => {
                currentTime.value = time;
                lastUpdateTime = time;
            },
            fail: (error) => {
                // 如果seekBackgroundAudio不支持，使用优化的重播策略
                if (wasPlaying && !isSeekingActive) {
                    isSeekingActive = true;

                    // 立即设置目标时间到UI，避免显示跳回0
                    currentTime.value = time;
                    lastUpdateTime = time;

                    // 暂时停止进度更新，避免状态闪烁
                    stopTaroProgressTimer();

                    // 停止背景音频
                    Taro.stopBackgroundAudio();

                    // 重新播放
                    setTimeout(() => {
                        Taro.playBackgroundAudio({
                            dataUrl: props.audioSourceUrl,
                            title: '音频播放',
                            success: () => {
                                // 播放成功后尝试跳转
                                setTimeout(() => {
                                    try {
                                        Taro.seekBackgroundAudio({
                                            position: time,
                                            success: () => {
                                                currentTime.value = time;
                                                lastUpdateTime = time;
                                                isSeekingActive = false;
                                                // 重新启动进度定时器
                                                if (isPlaying.value) {
                                                    startTaroProgressTimer();
                                                }
                                            },
                                            fail: () => {
                                                currentTime.value = time;
                                                lastUpdateTime = time;
                                                isSeekingActive = false;
                                                // 重新启动进度定时器
                                                if (isPlaying.value) {
                                                    startTaroProgressTimer();
                                                }
                                            },
                                        });
                                    } catch (e) {
                                        currentTime.value = time;
                                        lastUpdateTime = time;
                                        isSeekingActive = false;
                                        // 重新启动进度定时器
                                        if (isPlaying.value) {
                                            startTaroProgressTimer();
                                        }
                                    }
                                }, 150);
                            },
                            fail: () => {
                                isPlaying.value = false;
                                isSeekingActive = false;
                            },
                        });
                    }, 50);
                } else {
                    // 如果当前没有播放，只更新UI显示
                    currentTime.value = time;
                    lastUpdateTime = time;
                }
            },
        });
    } catch (error) {
        // 如果API不支持，至少更新UI显示
        currentTime.value = time;
        lastUpdateTime = time;
    }
};

const destroy = () => {
    try {
        // 停止Taro音频进度定时器
        stopTaroProgressTimer();

        // 如果使用Taro音频，停止播放
        if (usingTaroAudio.value) {
            try {
                Taro.stopBackgroundAudio();
            } catch (error) {
                console.warn('AudioPlayer: 停止Taro音频失败', error);
            }
            usingTaroAudio.value = false;
        }

        // 销毁原生音频上下文
        if (audioContext.value) {
            try {
                if (typeof audioContext.value.destroy === 'function') {
                    audioContext.value.destroy();
                } else if (typeof audioContext.value.stop === 'function') {
                    audioContext.value.stop();
                }
            } catch (error) {
                console.warn('AudioPlayer: 销毁音频上下文失败', error);
            }
            audioContext.value = null;
        }

        // 重置状态
        isPlaying.value = false;
        isReady.value = false;
        currentTime.value = 0;
        duration.value = 0;
        isDragging.value = false;
        isOperating.value = false;
        isSeekingActive = false;
    } catch (error) {
        console.error('AudioPlayer: destroy执行失败', error);
    }
};

const setupAudioEvents = () => {
    if (!audioContext.value) {
        console.warn('AudioPlayer: 音频上下文不存在，无法设置事件监听');
        return;
    }

    try {
        // 音频可以播放
        if (typeof audioContext.value.onCanplay === 'function') {
            audioContext.value.onCanplay(() => {
                isReady.value = true;
                console.log('AudioPlayer: 音频可以播放');

                try {
                    const audioDuration = audioContext.value.duration;
                    if (audioDuration && audioDuration > 0 && !isNaN(audioDuration)) {
                        // 更新时长信息
                        duration.value = audioDuration;
                        console.log('AudioPlayer: 主音频上下文获取时长', audioDuration);
                    }
                } catch (durationError) {
                    console.warn('AudioPlayer: 获取音频时长失败', durationError);
                }
            });
        }

        // 添加 onLoadedmetadata 事件监听
        if (typeof audioContext.value.onLoadedmetadata === 'function') {
            audioContext.value.onLoadedmetadata(() => {
                console.log('AudioPlayer: 音频元数据加载完成');
                try {
                    const audioDuration = audioContext.value.duration;
                    if (audioDuration && audioDuration > 0 && !isNaN(audioDuration)) {
                        duration.value = audioDuration;
                        console.log('AudioPlayer: 从元数据获取时长', audioDuration);
                    }
                } catch (durationError) {
                    console.warn('AudioPlayer: 从元数据获取时长失败', durationError);
                }
            });
        }

        // 播放开始
        if (typeof audioContext.value.onPlay === 'function') {
            audioContext.value.onPlay(() => {
                isPlaying.value = true;
                console.log('AudioPlayer: 播放开始');

                // 播放开始时再次尝试获取时长
                try {
                    const audioDuration = audioContext.value.duration;
                    if (audioDuration && audioDuration > 0 && !isNaN(audioDuration)) {
                        duration.value = audioDuration;
                    }
                } catch (e) {
                    // 静默处理
                }
            });
        }

        // 播放暂停
        if (typeof audioContext.value.onPause === 'function') {
            audioContext.value.onPause(() => {
                isPlaying.value = false;
                console.log('AudioPlayer: 播放暂停');
            });
        }

        // 播放结束
        if (typeof audioContext.value.onEnded === 'function') {
            audioContext.value.onEnded(() => {
                isPlaying.value = false;
                currentTime.value = 0;
                console.log('AudioPlayer: 播放结束');
            });
        }

        // 时间更新
        if (typeof audioContext.value.onTimeUpdate === 'function') {
            audioContext.value.onTimeUpdate(() => {
                if (!isDragging.value) {
                    try {
                        const current = audioContext.value.currentTime || 0;
                        if (!isNaN(current) && current >= 0) {
                            currentTime.value = current;
                            emit('timeUpdate', current);
                        }

                        // 在时间更新时也尝试获取时长
                        const audioDuration = audioContext.value.duration;
                        if (
                            audioDuration &&
                            audioDuration > 0 &&
                            !isNaN(audioDuration) &&
                            (!duration.value || duration.value !== audioDuration)
                        ) {
                            duration.value = audioDuration;
                        }
                    } catch (timeError) {
                        console.warn('AudioPlayer: 时间更新失败', timeError);
                    }
                }
            });
        }

        // 等待缓冲
        if (typeof audioContext.value.onWaiting === 'function') {
            audioContext.value.onWaiting(() => {
                console.log('AudioPlayer: 缓冲中...');
            });
        }

        // 错误处理
        if (typeof audioContext.value.onError === 'function') {
            audioContext.value.onError((error) => {
                console.error('AudioPlayer: 音频播放错误', error);

                isReady.value = false;
                isPlaying.value = false;

                let errorMessage = '音频播放失败';
                if (error && error.errCode) {
                    switch (error.errCode) {
                        case 10001:
                            errorMessage = '系统错误';
                            break;
                        case 10002:
                            errorMessage = '网络错误';
                            break;
                        case 10003:
                            errorMessage = '文件错误';
                            break;
                        case 10004:
                            errorMessage = '格式不支持';
                            break;
                        default:
                            errorMessage = `错误代码: ${error.errCode}`;
                    }
                }

                Taro.showToast({
                    title: errorMessage,
                    icon: 'none',
                    duration: 3000,
                });

                // 音频播放失败时尝试Taro音频
                if (!usingTaroAudio.value) {
                    setTimeout(() => {
                        tryTaroAudio();
                    }, 1000);
                }
            });
        }
    } catch (error) {
        console.error('AudioPlayer: 设置音频事件监听失败', error);
        // 即使事件设置失败，也尝试使用Taro音频
        tryTaroAudio();
    }
};

const tryTaroAudio = () => {
    if (!props.audioSourceUrl) {
        console.error('AudioPlayer: 音频URL为空，无法使用Taro音频');
        Taro.showToast({
            title: '音频地址无效',
            icon: 'none',
            duration: 2000,
        });
        return;
    }

    try {
        console.log('AudioPlayer: 尝试使用Taro音频API');

        // 注意：只有在用户点击播放时才调用此方法
        // 使用Taro的音频播放API
        Taro.playBackgroundAudio({
            dataUrl: props.audioSourceUrl,
            title: '音频播放',
            success: () => {
                console.log('AudioPlayer: Taro音频播放成功');
                isPlaying.value = true;
                usingTaroAudio.value = true;
                isReady.value = true;

                // 监听背景音频状态
                setupTaroAudioListeners();
            },
            fail: (error) => {
                console.error('AudioPlayer: Taro音频播放失败', error);

                // 最后尝试：使用简单的音频播放
                trySimpleAudio();
            },
        });
    } catch (error) {
        console.error('AudioPlayer: Taro音频API调用失败', error);
        trySimpleAudio();
    }
};

const setupTaroAudioListeners = () => {
    try {
        // 清除之前可能存在的监听器
        try {
            Taro.offBackgroundAudioPlay();
            Taro.offBackgroundAudioPause();
            Taro.offBackgroundAudioStop();
        } catch (e) {
            console.warn('AudioPlayer: 清除音频监听器失败', e);
        }

        // 监听背景音频播放状态
        Taro.onBackgroundAudioPlay(() => {
            isPlaying.value = true;
            usingTaroAudio.value = true;
            console.log('AudioPlayer: Taro音频开始播放');

            // 启动进度更新定时器
            startTaroProgressTimer();
        });

        Taro.onBackgroundAudioPause(() => {
            isPlaying.value = false;
            console.log('AudioPlayer: Taro音频暂停');

            // 停止进度更新定时器
            stopTaroProgressTimer();
        });

        Taro.onBackgroundAudioStop(() => {
            isPlaying.value = false;
            currentTime.value = 0;
            usingTaroAudio.value = false;
            console.log('AudioPlayer: Taro音频停止');

            // 停止进度更新定时器
            stopTaroProgressTimer();
        });

        // 获取背景音频播放状态
        Taro.getBackgroundAudioPlayerState({
            success: (res) => {
                if (res && res.status === 1) {
                    // 播放中
                    isPlaying.value = true;
                    usingTaroAudio.value = true;
                    currentTime.value = res.currentPosition || 0;
                    duration.value = res.duration || duration.value || props.duration || 0;
                    console.log('AudioPlayer: 获取Taro音频状态成功', res);

                    // 启动进度更新定时器
                    startTaroProgressTimer();
                }
            },
            fail: (error) => {
                console.warn('AudioPlayer: 获取Taro音频状态失败', error);
            },
        });
    } catch (error) {
        console.error('AudioPlayer: setupTaroAudioListeners执行失败', error);
    }
};

const startTaroProgressTimer = () => {
    try {
        stopTaroProgressTimer(); // 先停止现有定时器

        taroProgressTimer = setInterval(() => {
            // 增加操作锁检查，避免操作期间的状态冲突
            if (
                usingTaroAudio.value &&
                isPlaying.value &&
                !isDragging.value &&
                !isSeekingActive &&
                !isOperating.value
            ) {
                Taro.getBackgroundAudioPlayerState({
                    success: (res) => {
                        if (res && res.status === 1) {
                            // 播放中 - 只有当返回的时间合理时才更新
                            const newTime = res.currentPosition || 0;
                            const timeDiff = Math.abs(newTime - currentTime.value);

                            // 避免时间大幅跳跃，只接受合理的时间更新
                            if (newTime >= 0 && !isNaN(newTime) && (timeDiff < 5 || lastUpdateTime === 0)) {
                                currentTime.value = newTime;
                                lastUpdateTime = newTime;
                                emit('timeUpdate', currentTime.value);
                            }

                            const newDuration = res.duration || duration.value || props.duration || 0;
                            if (newDuration > 0 && !isNaN(newDuration)) {
                                duration.value = newDuration;
                            }
                        }
                    },
                    fail: () => {
                        // 静默失败，避免过多日志
                    },
                });
            }
        }, 1000); // 每秒更新一次
    } catch (error) {
        console.error('AudioPlayer: startTaroProgressTimer执行失败', error);
    }
};

const stopTaroProgressTimer = () => {
    try {
        if (taroProgressTimer) {
            clearInterval(taroProgressTimer);
            taroProgressTimer = null;
        }
    } catch (error) {
        console.error('AudioPlayer: stopTaroProgressTimer执行失败', error);
    }
};

const trySimpleAudio = () => {
    try {
        if (!props.audioSourceUrl) {
            console.error('AudioPlayer: 简单音频播放失败，音频URL为空');
            Taro.showModal({
                title: '播放失败',
                content: '音频地址无效，无法播放',
                showCancel: false,
                confirmText: '确定',
            });
            return;
        }

        console.log('AudioPlayer: 尝试简单音频播放');

        // 检查微信环境
        if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
            throw new Error('微信环境不可用');
        }

        // 创建最简单的音频上下文
        const simpleAudio = wx.createInnerAudioContext();
        if (!simpleAudio) {
            throw new Error('创建音频上下文失败');
        }

        simpleAudio.src = props.audioSourceUrl;

        // 设置基本的错误处理
        simpleAudio.onError((error) => {
            console.error('AudioPlayer: 简单音频播放错误', error);
            isPlaying.value = false;
        });

        // 立即播放，不等待事件
        simpleAudio.play();

        // 强制设置状态
        isPlaying.value = true;
        isReady.value = true;

        console.log('AudioPlayer: 简单音频播放尝试完成');

        Taro.showToast({
            title: '尝试播放中...',
            icon: 'loading',
            duration: 2000,
        });
    } catch (error) {
        console.error('AudioPlayer: trySimpleAudio执行失败', error);

        Taro.showModal({
            title: '播放失败',
            content: '音频播放功能暂时不可用，请稍后重试或检查网络连接',
            showCancel: false,
            confirmText: '确定',
        });
    }
};

// 生命周期
onMounted(() => {
    try {
        console.log('AudioPlayer: 组件挂载，开始初始化');
        console.log('AudioPlayer: props.audioSourceUrl:', props.audioSourceUrl);
        console.log('AudioPlayer: props.duration:', props.duration);

        // 不再立即设置时长，让其保持为0显示"--"
        // duration.value = 0;

        // 强制触发响应式更新
        nextTick(() => {
            console.log('AudioPlayer: nextTick中初始化');

            try {
                initAudio(); // 初始化并获取音频信息
                // 设置Taro音频监听器（但不自动播放）
                setupTaroAudioListeners();
            } catch (error) {
                console.error('AudioPlayer: nextTick中初始化失败', error);
                // 如果初始化失败，标记为准备就绪允许用户手动播放
                isReady.value = true;
            }
        });
    } catch (error) {
        console.error('AudioPlayer: onMounted执行失败', error);
        // 最后的兜底处理，标记为准备就绪
        isReady.value = true;
    }
});

onUnmounted(() => {
    try {
        console.log('AudioPlayer: 组件卸载，开始清理');

        // 销毁音频相关资源
        destroy();

        // 清除Taro音频监听器
        try {
            if (typeof Taro.offBackgroundAudioPlay === 'function') {
                Taro.offBackgroundAudioPlay();
            }
            if (typeof Taro.offBackgroundAudioPause === 'function') {
                Taro.offBackgroundAudioPause();
            }
            if (typeof Taro.offBackgroundAudioStop === 'function') {
                Taro.offBackgroundAudioStop();
            }
        } catch (e) {
            console.warn('AudioPlayer: 清除Taro音频监听器失败', e);
        }

        console.log('AudioPlayer: 组件清理完成');
    } catch (error) {
        console.error('AudioPlayer: onUnmounted执行失败', error);
    }
});
</script>

<style lang="scss" scoped src="./AudioPlayer.scss"></style>
