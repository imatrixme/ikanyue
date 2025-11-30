/**
 * 视频材料查询接口
 * 分页查询视频材料列表或获取单个视频材料详情，支持多种过滤条件
 * 对应原项目: api/controllers/videoMaterial/find.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;
const { processVideoMaterialFiles, processBatchFiles } = require('../../utils/fileUrl.js');

/**
 * 视频材料查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function videoMaterialFindHandler(c) {
    // 同时支持GET查询参数和POST form数据
    let params = {};

    if (c.req.method === 'GET') {
        params = c.req.query();
    } else if (c.req.method === 'POST') {
        const formData = await c.req.parseBody();
        const queryParams = c.req.query();
        // POST时优先使用form数据，缺失的参数用query参数补充
        params = { ...queryParams, ...formData };
    } else {
        params = c.req.query();
    }

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
    } = params;

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

            // 处理文件URL
            const processedRecord = processVideoMaterialFiles(record);

            return c.data(processedRecord, '查询成功');
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

        // 处理每个视频材料的文件URL
        const processedItems = processBatchFiles(result.items, processVideoMaterialFiles);

        return c.data(
            {
                items: processedItems,
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
