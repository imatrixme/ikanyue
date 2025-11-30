/**
 * 音频材料查询接口
 * 分页查询音频材料列表或获取单个音频材料详情，支持多种过滤条件
 * 对应原项目: api/controllers/audioMaterial/find.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;
const { processAudioMaterialFiles, processBatchFiles } = require('../../utils/fileUrl.js');

/**
 * 音频材料查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function audioMaterialFindHandler(c) {
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
        title = '',
        type = '',
        author = '',
        status = 'published',
        language = '',
        difficulty = '',
        tags = '',
        sort = '-created',
    } = params;

    try {
    // 查询单个音频材料
        if (id) {
            const [err, record] = await to(pb.collection('audio_materials').getOne(id));

            if (err) {
                if (err.status === 404) {
                    return c.error(404, '音频材料不存在');
                }
                console.error('音频材料查询失败:', err);
                return c.error(500, '查询失败，请稍后重试');
            }

            // 处理文件URL
            const processedRecord = processAudioMaterialFiles(record);

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

        // 标题搜索
        if (title.trim()) {
            filters.push(`title ~ "${title.trim()}"`);
        }

        // 类型过滤
        if (type.trim()) {
            filters.push(`type = "${type.trim()}"`);
        }

        // 作者过滤
        if (author.trim()) {
            filters.push(`author ~ "${author.trim()}"`);
        }

        // 状态过滤
        if (status && status !== 'all') {
            filters.push(`status = "${status}"`);
        }

        // 语言过滤
        if (language.trim()) {
            filters.push(`language = "${language.trim()}"`);
        }

        // 难度过滤
        if (difficulty.trim() && !isNaN(difficulty)) {
            filters.push(`difficulty = ${difficulty}`);
        }

        // 标签过滤
        if (tags.trim()) {
            filters.push(`tags ~ "${tags.trim()}"`);
        }

        const filter = filters.length > 0 ? filters.join(' && ') : '';

        // 查询音频材料列表
        const [err, result] = await to(
            pb.collection('audio_materials').getList(page, limit, {
                filter: filter,
                sort: sort,
            })
        );

        if (err) {
            console.error('音频材料列表查询失败:', err);
            return c.error(500, '查询失败，请稍后重试');
        }

        // 处理每个音频材料的文件URL
        const processedItems = processBatchFiles(result.items, processAudioMaterialFiles);

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
        console.error('音频材料查询异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { audioMaterialFindHandler };
