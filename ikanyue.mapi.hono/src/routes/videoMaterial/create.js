/**
 * 视频材料创建接口
 * 创建新的视频材料记录，需要教师权限
 * 对应原项目: api/controllers/videoMaterial/create.js
 */

const { pb } = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 视频材料创建处理器
 * @param {Object} c - Hono 上下文对象
 */
async function videoMaterialCreateHandler(c) {
    const body = await c.req.json();
    const user = c.get('user');

    const {
        title,
        type,
        description = '',
        videoSource,
        content = '',
        publishedAt = new Date().toISOString(),
        author,
        duration = 0,
        tags = [],
        sequence = 0,
        status = 'draft',
        coverImage = '',
        language = '',
        difficulty = 1,
        resolution = '',
        subtitles = '',
    } = body;

    // 必填字段验证
    if (!title || !title.trim()) {
        return c.error(400, '视频标题不能为空');
    }

    if (!type || !type.trim()) {
        return c.error(400, '视频类型不能为空');
    }

    if (!videoSource || !videoSource.trim()) {
        return c.error(400, '视频文件URL不能为空');
    }

    if (!author || !author.trim()) {
        return c.error(400, '视频作者不能为空');
    }

    // 数据类型验证
    if (duration && (isNaN(duration) || duration < 0)) {
        return c.error(400, '视频时长必须为非负数');
    }

    if (sequence && (isNaN(sequence) || sequence < 0)) {
        return c.error(400, '排序序号必须为非负整数');
    }

    if (difficulty && (isNaN(difficulty) || difficulty < 1 || difficulty > 5)) {
        return c.error(400, '难度等级必须为1-5之间的整数');
    }

    // 发布时间验证
    const publishDate = new Date(publishedAt);
    if (isNaN(publishDate.getTime())) {
        return c.error(400, '发布时间格式不正确');
    }

    try {
        // 构建创建数据
        const createData = {
            title: title.trim(),
            type: type.trim(),
            description: description.trim(),
            videoSource: videoSource.trim(),
            content: content.trim(),
            publishedAt: publishedAt,
            author: author.trim(),
            duration: parseInt(duration, 10),
            tags: Array.isArray(tags) ? tags : [],
            sequence: parseInt(sequence, 10),
            status: status || 'draft',
            coverImage: coverImage.trim(),
            language: language.trim(),
            difficulty: parseInt(difficulty, 10),
            resolution: resolution.trim(),
            subtitles: subtitles.trim(),
            createdBy: user.id,
            viewCount: 0,
            likeCount: 0,
        };

        // 创建视频材料记录
        const [err, record] = await to(pb.collection('videoMaterials').create(createData));

        if (err) {
            console.error('视频材料创建失败:', err);
            if (err.status === 400) {
                return c.error(400, '数据格式错误，请检查输入');
            }
            return c.error(500, '创建失败，请稍后重试');
        }

        return c.data(record, '视频材料创建成功');
    } catch (error) {
        console.error('视频材料创建异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { videoMaterialCreateHandler };
