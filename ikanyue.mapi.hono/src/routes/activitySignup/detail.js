/**
 * 活动报名详情接口
 * GET /v1/activity-signup/detail
 * GET /v1/activity-signup/:id
 */

const to = require('await-to-js').default;
const pb = require('../../utils/pocketbase');
const { mapActivitySignupRecord } = require('../../utils/activitySignupMappers');
const { resolveRelationId } = require('../../utils/recordMappers');

const SIGNUP_COLLECTION = 'activity_signups';

function extractSignupId(c) {
    const params = c.req.param();
    if (params?.id) {
        return params.id;
    }
    const query = c.req.query();
    return query.id || query.signupId || '';
}

async function activitySignupDetailHandler(c) {
    const user = c.get('user');
    if (!user?.id) {
        return c.error(403, '未授权，请重新登录');
    }

    const signupId = extractSignupId(c);
    if (!signupId) {
        return c.error(400, '缺少报名记录 ID');
    }

    const [err, record] = await to(
        pb.collection(SIGNUP_COLLECTION).getOne(signupId, {
            expand: 'activityId',
        })
    );

    if (err) {
        if (err.status === 404) {
            if (typeof err.message === 'string' && err.message.toLowerCase().includes('collection context')) {
                return c.error(500, '报名系统未配置（缺少 PocketBase 集合 activity_signups）');
            }
            return c.error(404, '报名记录不存在');
        }
        console.error('查询报名详情失败:', err);
        return c.error(500, '查询失败，请稍后再试');
    }

    const owner = resolveRelationId(record.userId);
    if (owner !== user.id) {
        return c.error(403, '无权访问该报名记录');
    }

    return c.data(mapActivitySignupRecord(record), '查询成功');
}

module.exports = { activitySignupDetailHandler };
