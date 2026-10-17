/**
 * 签到记录查询接口
 * GET /v1/attendance/find
 */

const to = require('await-to-js').default;
const pb = require('../../utils/pocketbase');
const { mapAttendanceRecord } = require('../../utils/recordMappers');
const { filterLiteral } = require('../../utils/publicUser');

/**
 * 构建 PocketBase 过滤字符串
 * @param {string[]} conditions
 * @returns {string}
 */
function buildFilter(conditions = []) {
    return conditions.filter(Boolean).join(' && ');
}

async function attendanceFindHandler(c) {
    const user = c.get('user');
    if (!user?.id) {
        return c.error(403, '未授权，请重新登录');
    }

    const query = c.req.query();
    const page = Number(query.page) || 1;
    const perPage = Math.min(Number(query.perPage) || 10, 50);
    const status = (query.status || '').trim();
    const lessonId = (query.lessonId || '').trim();

    if (page < 1 || perPage < 1) {
        return c.error(400, '分页参数不合法');
    }

    const filters = [`userId = ${filterLiteral(user.id)}`];
    if (status && status !== 'all') {
        filters.push(`status = ${filterLiteral(status)}`);
    }
    if (lessonId) {
        filters.push(`lessonId = ${filterLiteral(lessonId)}`);
    }

    const baseQuery = {
        filter: buildFilter(filters),
        sort: '-signedAt,-created',
        expand: 'lessonId,activityId',
    };

    const [err, result] = await to(pb.collection('attendance_records').getList(page, perPage, baseQuery));

    if (err) {
        console.error('签到记录查询失败:', err);
        return c.error(500, '查询失败，请稍后再试');
    }

    let listResult = result;
    // 如严格按 userId 过滤后无数据，尝试宽松模式（便于当前端 token 与 PB userId 不一致时调试）
    if (listResult?.totalItems === 0 && process.env.ALLOW_ATTENDANCE_FALLBACK !== 'false') {
        const [, fallback] = await to(
            pb.collection('attendance_records').getList(page, perPage, {
                ...baseQuery,
                filter: buildFilter(filters.filter((f) => !f.startsWith('userId ='))),
            })
        );
        if (fallback) {
            listResult = fallback;
        }
    }

    const list = (listResult?.items || []).map((item) => mapAttendanceRecord(item));

    return c.data(
        {
            list,
            pagination: {
                page: listResult?.page ?? page,
                perPage: listResult?.perPage ?? perPage,
                total: listResult?.totalItems ?? list.length,
                totalPages: listResult?.totalPages ?? (list.length ? 1 : 0),
            },
        },
        '查询成功'
    );
}

module.exports = { attendanceFindHandler };
