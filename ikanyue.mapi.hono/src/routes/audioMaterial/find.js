/**
 * 音频材料查询接口
 * 分页查询音频材料列表，支持按名称搜索
 * 对应原项目: api/controllers/audioMaterial/find.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 音频材料查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function audioMaterialFindHandler(c) {
    const body = await c.req.json();
    const { page = 1, limit = 10, name = '' } = body;

    // 参数验证
    if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
        return c.error(400, '页码和每页数量必须为正整数');
    }

    if (limit > 100) {
        return c.error(400, '每页数量不能超过100');
    }

    try {
        // 构建查询条件
        let filter = '';
        if (name.trim()) {
            filter = `name ~ "${name.trim()}"`;
        }

        // 查询音频材料
        const [err, result] = await to(
            pb.collection('audio_materials').getList(page, limit, {
                filter: filter,
                sort: '-created',
            })
        );

        if (err) {
            console.error('音频材料查询失败:', err);
            return c.error(500, '查询失败，请稍后重试');
        }

        return c.data(
            {
                items: result.items,
                totalItems: result.totalItems,
                totalPages: result.totalPages,
                page: result.page,
                perPage: result.perPage,
            },
            '查询成功'
        );
    } catch (error) {
        console.error('音频材料查询异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { audioMaterialFindHandler };
