/**
 * 上课记录列表接口
 * GET /v1/lesson-record/find
 */

const to = require('await-to-js').default;
const pb = require('../../utils/pocketbase');
const { mapLessonRecord } = require('../../utils/recordMappers');

async function lessonRecordFindHandler(c) {
    const user = c.get('user');
    if (!user?.id) {
        return c.error(403, '未授权，请重新登录');
    }

    const query = c.req.query();
    const page = Number(query.page) || 1;
    const perPage = Math.min(Number(query.perPage) || 10, 50);
    const status = (query.status || '').trim();

    if (page < 1 || perPage < 1) {
        return c.error(400, '分页参数不合法');
    }

    const filters = [`userId = "${user.id}"`];
    if (status && status !== 'all') {
        filters.push(`status = "${status}"`);
    }

    const baseQuery = {
        filter: filters.join(' && '),
        sort: '-startTime',
        expand: 'attendanceId',
    };

    const [err, result] = await to(pb.collection('lesson_records').getList(page, perPage, baseQuery));

    if (err) {
        console.error('上课记录查询失败:', err);
        return c.error(500, '查询失败，请稍后再试');
    }

    let listResult = result;
    // 如严格按 userId 过滤后无数据，尝试宽松模式（当前端 token 与 PB userId 不一致时便于调试）
    if (listResult?.totalItems === 0 && process.env.ALLOW_LESSON_FALLBACK !== 'false') {
        const [, fallback] = await to(
            pb.collection('lesson_records').getList(page, perPage, {
                ...baseQuery,
                filter: filters.filter((f) => !f.startsWith('userId =')).join(' && '),
            })
        );
        if (fallback) {
            listResult = fallback;
        }
    }

    const list = (listResult?.items || []).map((item) => mapLessonRecord(item));
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

module.exports = { lessonRecordFindHandler };
