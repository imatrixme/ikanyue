/**
 * 签到记录创建/更新接口
 * POST /v1/attendance
 */

const to = require('await-to-js').default;
const dayjs = require('dayjs');
const pb = require('../../utils/pocketbase');
const { mapAttendanceRecord, resolveRelationId } = require('../../utils/recordMappers');

const ALLOWED_STATUS = ['pending', 'signed', 'missed', 'abnormal'];

function sanitizeStatus(status) {
    if (!status) {
        return 'signed';
    }
    return ALLOWED_STATUS.includes(status) ? status : 'signed';
}

function sanitizeDate(value) {
    if (!value || !dayjs(value).isValid()) {
        return new Date().toISOString();
    }
    return dayjs(value).toISOString();
}

function normalizePayload(body = {}) {
    const payload = {};

    if (body.lessonId) {
        payload.lessonId = body.lessonId;
    }
    if (body.activityId) {
        payload.activityId = body.activityId;
    }
    if (body.remark) {
        payload.remark = String(body.remark);
    }
    if (body.location) {
        payload.location = String(body.location);
    }
    if (body.geo && typeof body.geo === 'object') {
        payload.geo = body.geo;
    }
    if (body.deviceInfo && typeof body.deviceInfo === 'object') {
        payload.deviceInfo = body.deviceInfo;
    }
    return payload;
}

async function findExistingAttendance(userId, lessonId) {
    if (!lessonId) {
        return null;
    }
    const [err, result] = await to(
        pb.collection('attendance_records').getList(1, 1, {
            filter: `userId = "${userId}" && lessonId = "${lessonId}"`,
            sort: '-created',
        })
    );
    if (err) {
        console.error('查询已有签到失败:', err);
        throw err;
    }
    return result.items?.[0] || null;
}

async function loadLessonRecord(lessonId) {
    if (!lessonId) {
        return null;
    }
    const [err, record] = await to(
        pb.collection('lesson_records').getOne(lessonId, {
            expand: 'attendanceId',
        })
    );
    if (err) {
        return Promise.reject(err);
    }
    return record;
}

async function hydrateAttendance(attendanceId) {
    const [err, record] = await to(
        pb.collection('attendance_records').getOne(attendanceId, {
            expand: 'lessonId,activityId',
        })
    );
    if (err) {
        console.error('刷新签到记录失败:', err);
        throw err;
    }
    return record;
}

async function attendanceCreateHandler(c) {
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

    const lessonId = (body.lessonId || '').trim();
    const activityId = (body.activityId || '').trim();
    if (!lessonId && !activityId) {
        return c.error(400, 'lessonId 或 activityId 至少需要一个');
    }

    let lessonRecord = null;
    if (lessonId) {
        try {
            lessonRecord = await loadLessonRecord(lessonId);
        } catch (error) {
            if (error.status === 404) {
                return c.error(404, '上课记录不存在');
            }
            console.error('查询上课记录失败:', error);
            return c.error(500, '查询课程信息失败');
        }
        const owner = resolveRelationId(lessonRecord.userId);
        if (owner !== user.id) {
            return c.error(403, '无权操作该上课记录');
        }
    }

    const status = sanitizeStatus(body.status);
    const signedAt = sanitizeDate(body.signedAt);
    if (status === 'signed' && dayjs(signedAt).isAfter(dayjs())) {
        return c.error(400, '签到时间不能晚于当前时间');
    }

    const data = {
        userId: user.id,
        status,
        signedAt,
        ...normalizePayload(body),
    };

    let savedRecord = null;
    try {
        const existing = await findExistingAttendance(user.id, lessonId);
        if (existing) {
            const [updateErr, updated] = await to(pb.collection('attendance_records').update(existing.id, data));
            if (updateErr) {
                console.error('更新签到记录失败:', updateErr);
                return c.error(500, '更新签到失败');
            }
            savedRecord = updated;
        } else {
            const [createErr, created] = await to(pb.collection('attendance_records').create(data));
            if (createErr) {
                console.error('创建签到记录失败:', createErr);
                return c.error(500, '创建签到失败');
            }
            savedRecord = created;
        }
    } catch (error) {
        return c.error(500, '保存签到记录失败');
    }

    if (lessonRecord && savedRecord?.id && resolveRelationId(lessonRecord.attendanceId) !== savedRecord.id) {
        const [linkErr] = await to(pb.collection('lesson_records').update(lessonRecord.id, { attendanceId: savedRecord.id }));
        if (linkErr) {
            console.error('更新课程签到关联失败:', linkErr);
        }
    }

    let hydrated = savedRecord;
    try {
        hydrated = await hydrateAttendance(savedRecord.id);
    } catch (error) {
        // ignore hydrate failures, fallback to savedRecord
    }

    return c.data(mapAttendanceRecord(hydrated), '签到成功');
}

module.exports = { attendanceCreateHandler };
