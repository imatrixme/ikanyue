/**
 * 活动报名列表接口
 * GET /v1/activity-signup/find
 */

const to = require('await-to-js').default;
const pb = require('../../utils/pocketbase');
const { mapActivitySignupRecord } = require('../../utils/activitySignupMappers');
const { filterLiteral } = require('../../utils/publicUser');

const SIGNUP_COLLECTION = 'activity_signups';

function buildFilter(conditions = []) {
    return conditions.filter(Boolean).join(' && ');
}

async function activitySignupFindHandler(c) {
    const user = c.get('user');
    if (!user?.id) {
        return c.error(403, '未授权，请重新登录');
    }

    const query = c.req.query();
    const page = Number(query.page) || 1;
    const perPage = Math.min(Number(query.perPage) || 10, 50);
    const status = (query.status || '').trim();
    const activityId = (query.activityId || '').trim();

    if (page < 1 || perPage < 1) {
        return c.error(400, '分页参数不合法');
    }

    const filters = [`userId = ${filterLiteral(user.id)}`];
    if (status && status !== 'all') {
        filters.push(`status = ${filterLiteral(status)}`);
    }
    if (activityId) {
        filters.push(`activityId = ${filterLiteral(activityId)}`);
    }

    const baseQuery = {
        filter: buildFilter(filters),
        sort: '-created',
        expand: 'activityId',
    };

    const [err, result] = await to(pb.collection(SIGNUP_COLLECTION).getList(page, perPage, baseQuery));

    if (err) {
        if (err.status === 404) {
            return c.error(500, '报名系统未配置（缺少 PocketBase 集合 activity_signups）');
        }
        console.error('报名记录查询失败:', err);
        return c.error(500, '查询失败，请稍后再试');
    }

    const listResult = result;
    const list = (listResult?.items || []).map((item) => mapActivitySignupRecord(item));

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

module.exports = { activitySignupFindHandler };
