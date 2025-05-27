/**
 * 音频材料创建接口
 * 创建新的音频材料记录，需要教师权限
 * 对应原项目: api/controllers/audioMaterial/create.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 音频材料创建处理器
 * @param {Object} c - Hono 上下文对象
 */
async function audioMaterialCreateHandler(c) {
    const body = await c.req.json();
    const user = c.get('user');

    const { name, description, fileUrl, duration, tags = [] } = body;

    // 参数验证
    if (!name || !name.trim()) {
        return c.error(400, '音频材料名称不能为空');
    }

    if (!fileUrl || !fileUrl.trim()) {
        return c.error(400, '音频文件地址不能为空');
    }

    if (duration && (isNaN(duration) || duration <= 0)) {
        return c.error(400, '音频时长必须为正数');
    }

    try {
        // 构建创建数据
        const createData = {
            name: name.trim(),
            description: description?.trim() || '',
            fileUrl: fileUrl.trim(),
            duration: duration || 0,
            tags: Array.isArray(tags) ? tags : [],
            createdBy: user.id,
            status: 'active',
        };

        // 创建音频材料记录
        const [err, newRecord] = await to(pb.collection('audio_materials').create(createData));

        if (err) {
            console.error('音频材料创建失败:', err);
            if (err.status === 400) {
                return c.error(400, '数据格式错误，请检查输入');
            }
            return c.error(500, '创建失败，请稍后重试');
        }

        return c.data(newRecord, '音频材料创建成功');
    } catch (error) {
        console.error('音频材料创建异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { audioMaterialCreateHandler };
