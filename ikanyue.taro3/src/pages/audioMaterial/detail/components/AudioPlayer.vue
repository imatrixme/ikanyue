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

        <!-- 进度条：只有当音频有时长时才显示 -->
        <view v-if="duration > 0" class="player-progress">
            <slider
                :value="currentTime"
                :max="duration"
                @changing="onSliderDrag"
                @change="onSliderRelease"
                :step="1"
                activeColor="#ff4949"
                backgroundColor="#e5e5e5"
                :disabled="false"
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
        <view v-if="isReady && !usingTaroAudio" class="player-controls-extra">
            <view class="speed-control">
                <view class="speed-options">
                    <text
                        v-for="speed in speedOptions"
                        :key="speed"
                        :class="['speed-option', { active: playbackRate === speed, disabled: !isReady }]"
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
const playbackRate = ref(1);
const isDragging = ref(false);
const isReady = ref(false);
const usingTaroAudio = ref(false); // 标记是否使用Taro音频API
const debugMode = ref(false); // 调试模式

// 配置选项
const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Taro音频进度定时器
let taroProgressTimer = null;
let lastUpdateTime = 0;
let isSeekingActive = false;

// 方法定义
const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const initAudio = () => {
    if (!props.audioSourceUrl) {
        return;
    }

    try {
        // 检查微信小程序环境
        if (typeof wx === 'undefined') {
            throw new Error('微信小程序环境未检测到');
        }

        // 创建音频上下文
        audioContext.value = wx.createInnerAudioContext();

        if (!audioContext.value) {
            throw new Error('创建音频上下文失败');
        }

        // 基本设置
        audioContext.value.autoplay = false;
        audioContext.value.loop = false;
        audioContext.value.volume = 1.0;

        // 设置音频源
        audioContext.value.src = props.audioSourceUrl;

        // 音频可以播放
        audioContext.value.onCanplay(() => {
            isReady.value = true;

            // 获取时长
            const audioDuration = audioContext.value.duration;

            if (audioDuration && audioDuration > 0) {
                duration.value = audioDuration;
            }
        });

        // 播放开始
        audioContext.value.onPlay(() => {
            isPlaying.value = true;
        });

        // 播放暂停
        audioContext.value.onPause(() => {
            isPlaying.value = false;
        });

        // 播放结束
        audioContext.value.onEnded(() => {
            isPlaying.value = false;
            currentTime.value = 0;
        });

        // 时间更新
        audioContext.value.onTimeUpdate(() => {
            if (!isDragging.value) {
                const current = audioContext.value.currentTime || 0;
                currentTime.value = current;
                emit('timeUpdate', current);
            }
        });

        // 等待缓冲
        audioContext.value.onWaiting(() => {
            // 缓冲中...
        });

        // 错误处理
        audioContext.value.onError((error) => {
            isReady.value = false;
            isPlaying.value = false;

            let errorMessage = '音频播放失败';
            if (error.errCode) {
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
        });
    } catch (error) {
        Taro.showToast({
            title: '音频初始化失败: ' + (error.message || '未知错误'),
            icon: 'none',
            duration: 3000,
        });
    }
};

const togglePlay = () => {
    // 如果正在使用Taro音频API
    if (usingTaroAudio.value) {
        try {
            if (isPlaying.value) {
                Taro.pauseBackgroundAudio();
            } else {
                Taro.playBackgroundAudio({
                    dataUrl: props.audioSourceUrl,
                    title: '音频播放',
                });
            }
        } catch (error) {
            Taro.showToast({
                title: '操作失败',
                icon: 'none',
                duration: 1000,
            });
        }
        return;
    }

    // 原有的audioContext逻辑
    if (!audioContext.value) {
        Taro.showToast({
            title: '音频播放器未初始化',
            icon: 'none',
            duration: 1000,
        });
        return;
    }

    if (!isReady.value) {
        // 尝试重新设置音频源
        if (props.audioSourceUrl && !audioContext.value.src) {
            audioContext.value.src = props.audioSourceUrl;
        }

        Taro.showToast({
            title: '正在准备音频...',
            icon: 'loading',
            duration: 1000,
        });
        return;
    }

    try {
        if (isPlaying.value) {
            audioContext.value.pause();
        } else {
            // 确保音频源正确设置
            if (!audioContext.value.src || audioContext.value.src !== props.audioSourceUrl) {
                audioContext.value.src = props.audioSourceUrl;
            }

            // 确保音量设置
            if (audioContext.value.volume !== 1) {
                audioContext.value.volume = 1;
            }

            // 执行播放
            audioContext.value.play();

            // 延迟检查并强制播放
            setTimeout(() => {
                if (!isPlaying.value && audioContext.value.paused) {
                    // 强制设置播放状态
                    isPlaying.value = true;

                    // 尝试重新播放
                    audioContext.value.play();

                    // 最后的检查，如果还是失败就使用备用方法
                    setTimeout(() => {
                        if (audioContext.value && audioContext.value.paused) {
                            isPlaying.value = false;
                            // 尝试备用播放方法
                            tryTaroAudio();
                        }
                    }, 1000);
                }
            }, 1000);
        }
    } catch (error) {
        Taro.showToast({
            title: '播放失败: ' + (error.message || '未知错误'),
            icon: 'none',
            duration: 2000,
        });
    }
};

const handleRewind = () => {
    if (usingTaroAudio.value) {
        const newTime = Math.max(0, currentTime.value - 10);
        seekToTime(newTime);
        return;
    }

    if (!audioContext.value || !isReady.value) return;

    const newTime = Math.max(0, currentTime.value - 10);
    audioContext.value.seek(newTime);
    currentTime.value = newTime;
};

const handleForward = () => {
    if (usingTaroAudio.value) {
        const newTime = Math.min(duration.value, currentTime.value + 10);
        seekToTime(newTime);
        return;
    }

    if (!audioContext.value || !isReady.value) return;

    const newTime = Math.min(duration.value, currentTime.value + 10);
    audioContext.value.seek(newTime);
    currentTime.value = newTime;
};

const onSliderDrag = (e) => {
    isDragging.value = true;
    currentTime.value = e.detail.value;

    // 暂停所有自动更新
    if (usingTaroAudio.value) {
        stopTaroProgressTimer();
        isSeekingActive = true; // 标记为拖动状态，阻止所有自动更新
    }
};

const onSliderRelease = (e) => {
    const time = e.detail.value;

    isDragging.value = false;

    if (usingTaroAudio.value) {
        // 保持UI显示不变，直接跳转
        seekToTimeQuietly(time);
    } else if (audioContext.value && isReady.value) {
        audioContext.value.seek(time);
        currentTime.value = time;
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

const seekToTimeQuietly = (time) => {
    const wasPlaying = isPlaying.value;

    // 立即设置UI状态，并保持不变
    currentTime.value = time;
    lastUpdateTime = time;

    try {
        // 首先尝试直接跳转，不停止播放
        Taro.seekBackgroundAudio({
            position: time,
            success: () => {
                // 跳转成功，恢复正常更新
                isSeekingActive = false;
                if (wasPlaying && isPlaying.value) {
                    setTimeout(() => {
                        startTaroProgressTimer();
                    }, 500);
                }
            },
            fail: (error) => {
                // 如果是播放状态且直接跳转失败，保持UI状态但不重播
                if (wasPlaying) {
                    // 保持UI显示，不更新音频状态
                    isSeekingActive = false;
                    // 简单重启定时器，让音频自然播放
                    setTimeout(() => {
                        if (isPlaying.value) {
                            startTaroProgressTimer();
                        }
                    }, 500);
                } else {
                    // 暂停状态下可以尝试重播跳转
                    Taro.playBackgroundAudio({
                        dataUrl: props.audioSourceUrl,
                        title: '音频播放',
                        success: () => {
                            setTimeout(() => {
                                try {
                                    Taro.seekBackgroundAudio({
                                        position: time,
                                        success: () => {
                                            isSeekingActive = false;
                                            if (isPlaying.value) {
                                                startTaroProgressTimer();
                                            }
                                        },
                                        fail: () => {
                                            isSeekingActive = false;
                                            if (isPlaying.value) {
                                                startTaroProgressTimer();
                                            }
                                        },
                                    });
                                } catch (e) {
                                    isSeekingActive = false;
                                    if (isPlaying.value) {
                                        startTaroProgressTimer();
                                    }
                                }
                            }, 200);
                        },
                        fail: () => {
                            isSeekingActive = false;
                        },
                    });
                }
            },
        });
    } catch (error) {
        // API不支持，恢复更新
        isSeekingActive = false;
        if (wasPlaying && isPlaying.value) {
            setTimeout(() => {
                startTaroProgressTimer();
            }, 500);
        }
    }
};

const changePlaybackRate = (rate) => {
    if (!audioContext.value || !isReady.value) return;

    playbackRate.value = rate;
    audioContext.value.playbackRate = rate;
};

const destroy = () => {
    // 停止Taro音频进度定时器
    stopTaroProgressTimer();

    // 如果使用Taro音频，停止播放
    if (usingTaroAudio.value) {
        try {
            Taro.stopBackgroundAudio();
        } catch (error) {
            // 静默处理
        }
        usingTaroAudio.value = false;
    }

    // 销毁原生音频上下文
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
};

const setupAudioEvents = () => {
    if (!audioContext.value) return;

    // 音频可以播放
    audioContext.value.onCanplay(() => {
        isReady.value = true;

        const audioDuration = audioContext.value.duration;
        if (audioDuration && audioDuration > 0) {
            duration.value = audioDuration;
        }
    });

    // 播放开始
    audioContext.value.onPlay(() => {
        isPlaying.value = true;
    });

    // 播放暂停
    audioContext.value.onPause(() => {
        isPlaying.value = false;
    });

    // 播放结束
    audioContext.value.onEnded(() => {
        isPlaying.value = false;
        currentTime.value = 0;
    });

    // 时间更新
    audioContext.value.onTimeUpdate(() => {
        if (!isDragging.value) {
            const current = audioContext.value.currentTime || 0;
            currentTime.value = current;
            emit('timeUpdate', current);
        }
    });

    // 错误处理
    audioContext.value.onError((error) => {
        isReady.value = false;
        isPlaying.value = false;
    });
};

const tryTaroAudio = () => {
    try {
        // 使用Taro的音频播放API
        Taro.playBackgroundAudio({
            dataUrl: props.audioSourceUrl,
            title: '音频播放',
            success: () => {
                isPlaying.value = true;
                usingTaroAudio.value = true; // 标记使用Taro音频

                // 监听背景音频状态
                setupTaroAudioListeners();
            },
            fail: (error) => {
                // 最后尝试：使用简单的音频播放
                trySimpleAudio();
            },
        });
    } catch (error) {
        trySimpleAudio();
    }
};

const setupTaroAudioListeners = () => {
    // 清除之前可能存在的监听器
    try {
        Taro.offBackgroundAudioPlay();
        Taro.offBackgroundAudioPause();
        Taro.offBackgroundAudioStop();
    } catch (e) {
        // 静默处理
    }

    // 监听背景音频播放状态
    Taro.onBackgroundAudioPlay(() => {
        isPlaying.value = true;
        usingTaroAudio.value = true;

        // 启动进度更新定时器
        startTaroProgressTimer();
    });

    Taro.onBackgroundAudioPause(() => {
        isPlaying.value = false;

        // 停止进度更新定时器
        stopTaroProgressTimer();
    });

    Taro.onBackgroundAudioStop(() => {
        isPlaying.value = false;
        currentTime.value = 0;
        usingTaroAudio.value = false;

        // 停止进度更新定时器
        stopTaroProgressTimer();
    });

    // 获取背景音频播放状态
    Taro.getBackgroundAudioPlayerState({
        success: (res) => {
            if (res.status === 1) {
                // 播放中
                isPlaying.value = true;
                usingTaroAudio.value = true;
                currentTime.value = res.currentPosition || 0;
                duration.value = res.duration || duration.value;

                // 启动进度更新定时器
                startTaroProgressTimer();
            }
        },
        fail: (error) => {
            // 静默处理
        },
    });
};

const startTaroProgressTimer = () => {
    stopTaroProgressTimer(); // 先停止现有定时器

    taroProgressTimer = setInterval(() => {
        if (usingTaroAudio.value && isPlaying.value && !isDragging.value && !isSeekingActive) {
            Taro.getBackgroundAudioPlayerState({
                success: (res) => {
                    if (res.status === 1) {
                        // 播放中 - 只有当返回的时间合理时才更新
                        const newTime = res.currentPosition || 0;
                        const timeDiff = Math.abs(newTime - currentTime.value);

                        // 避免时间大幅跳跃，只接受合理的时间更新
                        if (newTime >= 0 && (timeDiff < 5 || lastUpdateTime === 0)) {
                            currentTime.value = newTime;
                            lastUpdateTime = newTime;
                            emit('timeUpdate', currentTime.value);
                        }
                        duration.value = res.duration || duration.value;
                    }
                },
                fail: () => {
                    // 静默失败，避免过多日志
                },
            });
        }
    }, 1000); // 每秒更新一次
};

const stopTaroProgressTimer = () => {
    if (taroProgressTimer) {
        clearInterval(taroProgressTimer);
        taroProgressTimer = null;
    }
};

const trySimpleAudio = () => {
    try {
        // 创建最简单的音频上下文
        const simpleAudio = wx.createInnerAudioContext();
        simpleAudio.src = props.audioSourceUrl;

        // 立即播放，不等待事件
        simpleAudio.play();

        // 强制设置状态
        isPlaying.value = true;

        Taro.showToast({
            title: '尝试播放中...',
            icon: 'loading',
            duration: 2000,
        });
    } catch (error) {
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
    initAudio();
    // 设置Taro音频监听器
    setupTaroAudioListeners();
});

onUnmounted(() => {
    destroy();
    // 清除Taro音频监听器
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
