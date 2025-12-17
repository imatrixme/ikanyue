/**
 * 活动报名创建接口
 * POST /v1/activity-signup
 */

const to = require('await-to-js').default;
const dayjs = require('dayjs');
const pb = require('../../utils/pocketbase');
const { mapActivitySignupRecord } = require('../../utils/activitySignupMappers');

const SIGNUP_COLLECTION = 'activity_signups';

function sanitizeRealName(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }
    return text.slice(0, 50);
}

function sanitizeAge(value) {
    const num = Number(value);
    if (Number.isNaN(num)) {
        return null;
    }
    return Math.floor(num);
}

async function loadActivity(activityId) {
    const [err, record] = await to(pb.collection('activities').getOne(activityId));
    if (err) {
        throw err;
    }
    return record;
}

async function findExistingSignup(userId, activityId) {
    const [err, result] = await to(
        pb.collection(SIGNUP_COLLECTION).getList(1, 1, {
            filter: `userId = "${userId}" && activityId = "${activityId}"`,
            sort: '-created',
            expand: 'activityId',
        })
    );
    if (err) {
        throw err;
    }
    return result.items?.[0] || null;
}

async function hydrateSignup(signupId) {
    const [err, record] = await to(
        pb.collection(SIGNUP_COLLECTION).getOne(signupId, {
            expand: 'activityId',
        })
    );
    if (err) {
        throw err;
    }
    return record;
}

async function countRegisteredSignups(activityId) {
    const [err, result] = await to(
        pb.collection(SIGNUP_COLLECTION).getList(1, 1, {
            filter: `activityId = "${activityId}" && status = "registered"`,
        })
    );
    if (err) {
        throw err;
    }
    return Number(result?.totalItems) || 0;
}

async function activitySignupCreateHandler(c) {
    const user = c.get('user');
    if (!user?.id) {
        return c.error(403, '未授权，请重新登录');
    }

    let body = {};
    try {
        body = await c.req.json();
    } catch (error) {
        return c.error(400, '请求体格式错误');
    }

    const activityId = (body.activityId || body.id || '').trim();
    const realName = sanitizeRealName(body.realName);
    const age = sanitizeAge(body.age);

    if (!activityId) {
        return c.error(400, '缺少活动 ID');
    }
    if (!realName) {
        return c.error(400, '请填写真实姓名');
    }
    if (!age || age < 1 || age > 120) {
        return c.error(400, '请填写正确的年龄');
    }

    let activity = null;
    try {
        activity = await loadActivity(activityId);
    } catch (error) {
        if (error.status === 404) {
            return c.error(404, '活动不存在');
        }
        console.error('查询活动失败:', error);
        return c.error(500, '查询活动失败，请稍后重试');
    }

    if (activity?.endTime && dayjs(activity.endTime).isValid() && dayjs(activity.endTime).isBefore(dayjs())) {
        return c.error(400, '活动已结束，无法报名');
    }

    let existing = null;
    try {
        existing = await findExistingSignup(user.id, activityId);
    } catch (error) {
        if (error.status === 404) {
            return c.error(500, '报名系统未配置（缺少 PocketBase 集合 activity_signups）');
        }
        console.error('查询报名记录失败:', error);
        return c.error(500, '查询报名记录失败');
    }

    if (existing) {
        return c.data(mapActivitySignupRecord(existing), '已报名');
    }

    const maxParticipants = Number(activity?.maxParticipants ?? activity?.max_participants ?? 0) || 0;
    if (maxParticipants > 0) {
        try {
            const registeredCount = await countRegisteredSignups(activityId);
            if (registeredCount >= maxParticipants) {
                return c.error(400, '名额已满');
            }
        } catch (error) {
            console.error('查询活动报名人数失败:', error);
            // 容量检查失败不阻断报名，但仍记录日志便于排查 PocketBase 状态
        }
    }

    const payload = {
        userId: user.id,
        activityId,
        realName,
        age,
        status: 'registered',
    };

    const [createErr, created] = await to(pb.collection(SIGNUP_COLLECTION).create(payload));
    if (createErr) {
        if (createErr.status === 404) {
            return c.error(500, '报名系统未配置（缺少 PocketBase 集合 activity_signups）');
        }

        // 处理并发下的唯一索引冲突：回读已存在记录并按幂等成功返回
        if (createErr.status === 400) {
            try {
                const retryExisting = await findExistingSignup(user.id, activityId);
                if (retryExisting) {
                    return c.data(mapActivitySignupRecord(retryExisting), '已报名');
                }
            } catch (error) {
                // ignore and fallback to generic error
            }
        }

        console.error('创建报名记录失败:', createErr);
        return c.error(500, createErr.message || '报名失败，请稍后再试');
    }

    let hydrated = created;
    try {
        hydrated = await hydrateSignup(created.id);
    } catch (error) {
        // ignore hydrate failure
    }

    return c.data(mapActivitySignupRecord(hydrated), '报名成功');
}

module.exports = { activitySignupCreateHandler };
