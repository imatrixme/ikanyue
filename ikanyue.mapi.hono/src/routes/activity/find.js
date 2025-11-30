/**
 * 活动查询接口
 * 分页查询活动列表或获取单个活动详情，支持多种过滤条件
 * 对应原项目: api/controllers/activity/find.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;
const { processActivityFiles, processBatchFiles } = require('../../utils/fileUrl.js');

/**
 * 活动查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function activityFindHandler(c) {
    const query = c.req.query();
    const {
        id = '',
        page = 1,
        limit = 20,
        status = 'active',
        sort = '-created',
        tags = '',
        type = '',
        location = ''
    } = query;

    try {
    // 查询单个活动
        if (id) {
            const [err, record] = await to(pb.collection('activities').getOne(id));

            if (err) {
                if (err.status === 404) {
                    return c.error(404, '活动不存在');
                }
                console.error('活动查询失败:', err);
                return c.error(500, '查询失败，请稍后重试');
            }

            // 处理图片URL
            const processedRecord = processActivityFiles(record);

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

        // 地点过滤
        if (location.trim()) {
            filters.push(`location ~ "${location.trim()}"`);
        }

        const filter = filters.length > 0 ? filters.join(' && ') : '';

        // 查询活动列表
        const [err, result] = await to(
            pb.collection('activities').getList(page, limit, {
                filter: filter,
                sort: sort
            })
        );

        if (err) {
            console.error('活动列表查询失败:', err);
            return c.error(500, '查询失败，请稍后重试');
        }

        // 处理每个活动的图片URL
        const processedItems = processBatchFiles(result.items, processActivityFiles);

        return c.data(
            {
                items: processedItems,
                totalItems: result.totalItems,
                totalPages: result.totalPages,
                page: result.page,
                perPage: result.perPage
            },
            '查询成功'
        );
    } catch (error) {
        console.error('活动查询异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { activityFindHandler };
