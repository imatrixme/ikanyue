/**
 * 活动查询接口（公开）
 * 分页查询已发布活动或获取单个已发布活动；调用方参数一律按字面量匹配
 * 对应原项目: api/controllers/activity/find.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;
const { processActivityFiles, processBatchFiles } = require('../../utils/fileUrl.js');
const { filterLiteral } = require('../../utils/publicUser.js');

// Public callers only ever see published activities; the status filter is not caller-controlled.
const PUBLISHED_FILTER = `status = ${filterLiteral('active')}`;
const SORTABLE_FIELDS = new Set(['created', 'updated', 'startTime', 'sequence']);
const DEFAULT_SORT = '-created';

/**
 * 活动查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function activityFindHandler(c) {
    const query = c.req.query();
    const {
        id = '',
        page: rawPage = '1',
        limit: rawLimit,
        perPage,
        sort: rawSort = DEFAULT_SORT,
        tags = '',
        type = '',
        location = '',
        start_time_gte: startTimeGte,
        start_time_lte: startTimeLte,
        startTimeGte: camelStartTimeGte,
        startTimeLte: camelStartTimeLte,
    } = query;
    const page = Number(rawPage);
    const limit = Number(rawLimit || perPage || 20);

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
            if (record.status !== 'active') {
                return c.error(404, '活动不存在');
            }

            // 处理图片URL
            const processedRecord = processActivityFiles(record);

            return c.data(processedRecord, '查询成功');
        }

        // 参数验证
        if (!Number.isInteger(page) || !Number.isInteger(limit) || page < 1 || limit < 1) {
            return c.error(400, '页码和每页数量必须为正整数');
        }

        if (limit > 100) {
            return c.error(400, '每页数量不能超过100');
        }

        const filters = [PUBLISHED_FILTER];

        // 标签过滤
        tags.split(',').map((tag) => tag.trim()).filter(Boolean).forEach((tag) => {
            filters.push(`tags ~ ${filterLiteral(tag)}`);
        });

        // 类型过滤
        if (type.trim()) {
            filters.push(`type = ${filterLiteral(type.trim())}`);
        }

        // 地点过滤
        if (location.trim()) {
            filters.push(`location ~ ${filterLiteral(location.trim())}`);
        }

        const bounds = [
            ['>=', startTimeGte || camelStartTimeGte || ''],
            ['<=', startTimeLte || camelStartTimeLte || ''],
        ];
        for (const [operator, raw] of bounds) {
            if (!raw.trim()) continue;
            const time = Date.parse(raw.trim());
            if (Number.isNaN(time)) {
                return c.error(400, '活动时间范围无效');
            }
            filters.push(`startTime ${operator} ${filterLiteral(new Date(time).toISOString())}`);
        }

        // 查询活动列表
        const [err, result] = await to(
            pb.collection('activities').getList(page, limit, {
                filter: filters.join(' && '),
                sort: safeSort(rawSort),
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

function safeSort(value) {
    const fields = String(value).split(',').map((field) => field.trim());
    const valid = fields.length > 0 && fields.every((field) => SORTABLE_FIELDS.has(field.replace(/^[-+]/, '')));
    return valid ? fields.join(',') : DEFAULT_SORT;
}

module.exports = { activityFindHandler };
