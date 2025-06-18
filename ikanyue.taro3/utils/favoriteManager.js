import Taro from '@tarojs/taro';

/**
 * 收藏管理器
 * 用于管理音频材料的本地收藏功能
 */
class FavoriteManager {
    constructor() {
        this.STORAGE_KEY = 'audio_favorites';
        this.VIDEO_STORAGE_KEY = 'video_favorites';
    }

    /**
     * 获取所有收藏的音频ID列表
     * @returns {Promise<Array<string>>} 收藏的音频ID数组
     */
    async getFavoriteIds() {
        try {
            const res = await Taro.getStorage({ key: this.STORAGE_KEY });
            return Array.isArray(res.data) ? res.data : [];
        } catch (error) {
            console.log('获取收藏列表失败:', error);
            return [];
        }
    }

    /**
     * 获取所有收藏的音频详细信息
     * @returns {Promise<Array<Object>>} 收藏的音频对象数组
     */
    async getFavoriteAudios() {
        try {
            const res = await Taro.getStorage({ key: `${this.STORAGE_KEY}_details` });
            return Array.isArray(res.data) ? res.data : [];
        } catch (error) {
            console.log('获取收藏详情失败:', error);
            return [];
        }
    }

    /**
     * 检查音频是否已收藏
     * @param {string} audioId 音频ID
     * @returns {Promise<boolean>} 是否已收藏
     */
    async isFavorite(audioId) {
        const favoriteIds = await this.getFavoriteIds();
        return favoriteIds.includes(audioId);
    }

    /**
     * 添加收藏
     * @param {Object} audio 音频对象
     * @returns {Promise<boolean>} 是否添加成功
     */
    async addFavorite(audio) {
        try {
            const favoriteIds = await this.getFavoriteIds();
            const favoriteAudios = await this.getFavoriteAudios();

            // 如果已经收藏则不重复添加
            if (favoriteIds.includes(audio.id)) {
                return true;
            }

            // 添加到ID列表
            favoriteIds.push(audio.id);
            await Taro.setStorage({
                key: this.STORAGE_KEY,
                data: favoriteIds,
            });

            // 添加到详情列表（包含收藏时间）
            const favoriteItem = {
                ...audio,
                favoriteTime: new Date().toISOString(),
            };
            favoriteAudios.push(favoriteItem);
            await Taro.setStorage({
                key: `${this.STORAGE_KEY}_details`,
                data: favoriteAudios,
            });

            console.log('添加收藏成功:', audio.title);
            return true;
        } catch (error) {
            console.error('添加收藏失败:', error);
            return false;
        }
    }

    /**
     * 移除收藏
     * @param {string} audioId 音频ID
     * @returns {Promise<boolean>} 是否移除成功
     */
    async removeFavorite(audioId) {
        try {
            const favoriteIds = await this.getFavoriteIds();
            const favoriteAudios = await this.getFavoriteAudios();

            // 从ID列表中移除
            const newFavoriteIds = favoriteIds.filter((id) => id !== audioId);
            await Taro.setStorage({
                key: this.STORAGE_KEY,
                data: newFavoriteIds,
            });

            // 从详情列表中移除
            const newFavoriteAudios = favoriteAudios.filter((audio) => audio.id !== audioId);
            await Taro.setStorage({
                key: `${this.STORAGE_KEY}_details`,
                data: newFavoriteAudios,
            });

            console.log('移除收藏成功:', audioId);
            return true;
        } catch (error) {
            console.error('移除收藏失败:', error);
            return false;
        }
    }

    /**
     * 切换收藏状态
     * @param {Object} audio 音频对象
     * @returns {Promise<boolean>} 切换后的收藏状态
     */
    async toggleFavorite(audio) {
        const isFav = await this.isFavorite(audio.id);

        if (isFav) {
            await this.removeFavorite(audio.id);
            return false;
        } else {
            await this.addFavorite(audio);
            return true;
        }
    }

    /**
     * 获取收藏数量
     * @returns {Promise<number>} 收藏数量
     */
    async getFavoriteCount() {
        const favoriteIds = await this.getFavoriteIds();
        return favoriteIds.length;
    }

    /**
     * 清空所有收藏
     * @returns {Promise<boolean>} 是否清空成功
     */
    async clearFavorites() {
        try {
            await Taro.removeStorage({ key: this.STORAGE_KEY });
            await Taro.removeStorage({ key: `${this.STORAGE_KEY}_details` });
            console.log('清空收藏成功');
            return true;
        } catch (error) {
            console.error('清空收藏失败:', error);
            return false;
        }
    }

    // ===== 视频收藏功能 =====

    /**
     * 获取所有收藏的视频ID列表
     * @returns {Promise<Array<string>>} 收藏的视频ID数组
     */
    async getFavoriteVideoIds() {
        try {
            const res = await Taro.getStorage({ key: this.VIDEO_STORAGE_KEY });
            return Array.isArray(res.data) ? res.data : [];
        } catch (error) {
            console.log('获取视频收藏列表失败:', error);
            return [];
        }
    }

    /**
     * 获取所有收藏的视频详细信息
     * @returns {Promise<Array<Object>>} 收藏的视频对象数组
     */
    async getFavoriteVideos() {
        try {
            const res = await Taro.getStorage({ key: `${this.VIDEO_STORAGE_KEY}_details` });
            return Array.isArray(res.data) ? res.data : [];
        } catch (error) {
            console.log('获取视频收藏详情失败:', error);
            return [];
        }
    }

    /**
     * 检查视频是否已收藏
     * @param {string} videoId 视频ID
     * @returns {Promise<boolean>} 是否已收藏
     */
    async isFavoriteVideo(videoId) {
        const favoriteIds = await this.getFavoriteVideoIds();
        return favoriteIds.includes(videoId);
    }

    /**
     * 添加视频收藏
     * @param {Object} video 视频对象
     * @returns {Promise<boolean>} 是否添加成功
     */
    async addFavoriteVideo(video) {
        try {
            const favoriteIds = await this.getFavoriteVideoIds();
            const favoriteVideos = await this.getFavoriteVideos();

            // 如果已经收藏则不重复添加
            if (favoriteIds.includes(video.id)) {
                return true;
            }

            // 添加到ID列表
            favoriteIds.push(video.id);
            await Taro.setStorage({
                key: this.VIDEO_STORAGE_KEY,
                data: favoriteIds,
            });

            // 添加到详情列表（包含收藏时间）
            const favoriteItem = {
                ...video,
                favoriteTime: new Date().toISOString(),
            };
            favoriteVideos.push(favoriteItem);
            await Taro.setStorage({
                key: `${this.VIDEO_STORAGE_KEY}_details`,
                data: favoriteVideos,
            });

            console.log('添加视频收藏成功:', video.title);
            return true;
        } catch (error) {
            console.error('添加视频收藏失败:', error);
            return false;
        }
    }

    /**
     * 移除视频收藏
     * @param {string} videoId 视频ID
     * @returns {Promise<boolean>} 是否移除成功
     */
    async removeFavoriteVideo(videoId) {
        try {
            const favoriteIds = await this.getFavoriteVideoIds();
            const favoriteVideos = await this.getFavoriteVideos();

            // 从ID列表中移除
            const newFavoriteIds = favoriteIds.filter((id) => id !== videoId);
            await Taro.setStorage({
                key: this.VIDEO_STORAGE_KEY,
                data: newFavoriteIds,
            });

            // 从详情列表中移除
            const newFavoriteVideos = favoriteVideos.filter((video) => video.id !== videoId);
            await Taro.setStorage({
                key: `${this.VIDEO_STORAGE_KEY}_details`,
                data: newFavoriteVideos,
            });

            console.log('移除视频收藏成功:', videoId);
            return true;
        } catch (error) {
            console.error('移除视频收藏失败:', error);
            return false;
        }
    }

    /**
     * 切换视频收藏状态
     * @param {Object} video 视频对象
     * @returns {Promise<boolean>} 切换后的收藏状态
     */
    async toggleFavoriteVideo(video) {
        const isFav = await this.isFavoriteVideo(video.id);

        if (isFav) {
            await this.removeFavoriteVideo(video.id);
            return false;
        } else {
            await this.addFavoriteVideo(video);
            return true;
        }
    }

    /**
     * 获取视频收藏数量
     * @returns {Promise<number>} 收藏数量
     */
    async getFavoriteVideoCount() {
        const favoriteIds = await this.getFavoriteVideoIds();
        return favoriteIds.length;
    }

    /**
     * 清空所有视频收藏
     * @returns {Promise<boolean>} 是否清空成功
     */
    async clearVideoFavorites() {
        try {
            await Taro.removeStorage({ key: this.VIDEO_STORAGE_KEY });
            await Taro.removeStorage({ key: `${this.VIDEO_STORAGE_KEY}_details` });
            console.log('清空视频收藏成功');
            return true;
        } catch (error) {
            console.error('清空视频收藏失败:', error);
            return false;
        }
    }
}

// 导出单例实例
export const favoriteManager = new FavoriteManager();
export default favoriteManager;
