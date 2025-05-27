/**
 * 视频材料查询接口
 * 分页查询视频材料列表或获取单个视频材料详情，支持多种过滤条件
 * 对应原项目: api/controllers/videoMaterial/find.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 视频材料查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function videoMaterialFindHandler(c) {
    const body = await c.req.json();
    const {
        id = '',
        page = 1,
        limit = 20,
        status = 'published',
        sort = '-publishedAt',
        tags = '',
        type = '',
        language = '',
        difficulty = '',
        resolution = '',
        author = '',
    } = body;

    try {
        // 查询单个视频材料
        if (id) {
            const [err, record] = await to(pb.collection('video_materials').getOne(id));

            if (err) {
                if (err.status === 404) {
                    return c.error(404, '视频材料不存在');
                }
                console.error('视频材料查询失败:', err);
                return c.error(500, '查询失败，请稍后重试');
            }

            return c.data(record, '查询成功');
        }

        // 参数验证
        if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
            return c.error(400, '页码和每页数量必须为正整数');
        }

        if (limit > 100) {
            return c.error(400, '每页数量不能超过100');
        }

        // 构建过滤条件
        let filters = [];

        // 状态过滤
        if (status && status !== 'all') {
            filters.push(`status = "${status}"`);
        }

        // 标签过滤
        if (tags.trim()) {
            const tagArray = tags.split(',').map((tag) => tag.trim());
            for (const tag of tagArray) {
                filters.push(`tags ~ "${tag}"`);
            }
        }

        // 类型过滤
        if (type.trim()) {
            filters.push(`type = "${type.trim()}"`);
        }

        // 语言过滤
        if (language.trim()) {
            filters.push(`language = "${language.trim()}"`);
        }

        // 难度等级过滤
        if (difficulty.trim() && !isNaN(difficulty)) {
            filters.push(`difficulty = ${parseInt(difficulty, 10)}`);
        }

        // 分辨率过滤
        if (resolution.trim()) {
            filters.push(`resolution = "${resolution.trim()}"`);
        }

        // 作者过滤
        if (author.trim()) {
            filters.push(`author ~ "${author.trim()}"`);
        }

        const filter = filters.length > 0 ? filters.join(' && ') : '';

        // 查询视频材料列表
        const [err, result] = await to(
            pb.collection('video_materials').getList(page, limit, {
                filter: filter,
                sort: sort,
            })
        );

        if (err) {
            console.error('视频材料列表查询失败:', err);
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
        console.error('视频材料查询异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { videoMaterialFindHandler };
