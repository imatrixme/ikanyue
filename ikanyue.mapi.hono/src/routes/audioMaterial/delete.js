/**
 * 音频材料删除接口
 * 删除指定音频材料，需要教师权限
 * 对应原项目: api/controllers/audioMaterial/delete.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 音频材料删除处理器
 * @param {Object} c - Hono 上下文对象
 */
async function audioMaterialDeleteHandler(c) {
    const body = await c.req.parseBody();
    const { id } = body;

    // ID必填验证
    if (!id || !id.trim()) {
        return c.error(400, '音频材料ID不能为空');
    }

    try {
    // 检查音频材料是否存在
        const [checkErr] = await to(pb.collection('audio_materials').getOne(id.trim()));

        if (checkErr) {
            if (checkErr.status === 404) {
                return c.error(404, '音频材料不存在');
            }
            console.error('音频材料查询失败:', checkErr);
            return c.error(500, '查询失败，请稍后重试');
        }

        // 删除音频材料记录
        const [err] = await to(pb.collection('audio_materials').delete(id.trim()));

        if (err) {
            console.error('音频材料删除失败:', err);
            return c.error(500, '删除失败，请稍后重试');
        }

        return c.data({ success: true, message: '音频材料删除成功' }, '音频材料删除成功');
    } catch (error) {
        console.error('音频材料删除异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { audioMaterialDeleteHandler };
