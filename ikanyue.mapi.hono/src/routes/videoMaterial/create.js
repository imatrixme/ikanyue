/**
 * 视频材料创建接口
 * 创建新的视频材料记录，需要教师权限
 * 对应原项目: api/controllers/videoMaterial/create.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 视频材料创建处理器
 * @param {Object} c - Hono 上下文对象
 */
async function videoMaterialCreateHandler(c) {
    const body = await c.req.parseBody();

    const {
        title,
        type,
        description,
        videoSource,
        content,
        publishedAt,
        author,
        duration,
        sequence,
        status = 'draft',
        coverImage,
        language,
        difficulty,
        resolution,
        subtitles,
        tags,
    } = body;

    // 参数验证
    if (!title || !title.trim()) {
        return c.error(400, '视频材料标题不能为空');
    }

    if (!videoSource || !videoSource.trim()) {
        return c.error(400, '视频源文件不能为空');
    }

    if (duration && (isNaN(duration) || duration <= 0)) {
        return c.error(400, '视频时长必须为正数');
    }

    if (sequence && (isNaN(sequence) || sequence < 0)) {
        return c.error(400, '排序序号必须为非负整数');
    }

    if (difficulty && (isNaN(difficulty) || difficulty < 1 || difficulty > 5)) {
        return c.error(400, '难度等级必须为1-5之间的整数');
    }

    // 验证语言选项
    if (language && !['中文', '英文'].includes(language)) {
        return c.error(400, '语言选项只能是"中文"或"英文"');
    }

    // 验证状态选项
    if (status && !['draft', 'published'].includes(status)) {
        return c.error(400, '状态只能是"draft"或"published"');
    }

    // 验证分辨率选项
    if (resolution && !['480p', '720p', '1080p', '4k'].includes(resolution)) {
        return c.error(400, '分辨率只能是"480p"、"720p"、"1080p"或"4k"');
    }

    try {
    // 构建创建数据
        const createData = {
            title: title.trim(),
            videoSource: videoSource.trim(),
        };

        // 可选字段
        if (type && type.trim()) createData.type = type.trim();
        if (description && description.trim()) createData.description = description.trim();
        if (content && content.trim()) createData.content = content.trim();
        if (author && author.trim()) createData.author = author.trim();
        if (coverImage && coverImage.trim()) createData.coverImage = coverImage.trim();
        if (subtitles && subtitles.trim()) createData.subtitles = subtitles.trim();
        if (language) createData.language = language;
        if (resolution) createData.resolution = resolution;
        if (tags && tags.trim()) createData.tags = tags.trim();

        if (duration) createData.duration = parseFloat(duration);
        if (sequence) createData.sequence = parseInt(sequence, 10);
        if (difficulty) createData.difficulty = parseInt(difficulty, 10);

        createData.status = status;

        // 处理发布时间
        if (publishedAt) {
            const publishDate = new Date(publishedAt);
            if (isNaN(publishDate.getTime())) {
                return c.error(400, '发布时间格式不正确');
            }
            createData.publishedAt = publishedAt;
        }

        // 创建视频材料记录
        const [err, newRecord] = await to(pb.collection('video_materials').create(createData));

        if (err) {
            console.error('视频材料创建失败:', err);
            if (err.status === 400) {
                return c.error(400, '数据格式错误，请检查输入');
            }
            return c.error(500, '创建失败，请稍后重试');
        }

        return c.data(newRecord, '视频材料创建成功');
    } catch (error) {
        console.error('视频材料创建异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { videoMaterialCreateHandler };
