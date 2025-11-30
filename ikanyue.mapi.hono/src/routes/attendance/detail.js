/**
 * 签到记录详情接口
 * GET /v1/attendance/detail
 * GET /v1/attendance/:id
 */

const to = require('await-to-js').default;
const pb = require('../../utils/pocketbase');
const { mapAttendanceRecord, resolveRelationId } = require('../../utils/recordMappers');

function extractAttendanceId(c) {
    const params = c.req.param();
    if (params?.id) {
        return params.id;
    }
    const query = c.req.query();
    return query.id || query.recordId || '';
}

async function attendanceDetailHandler(c) {
    const user = c.get('user');
    if (!user?.id) {
        return c.error(403, '未授权，请重新登录');
    }

    const attendanceId = extractAttendanceId(c);
    if (!attendanceId) {
        return c.error(400, '缺少签到记录 ID');
    }

    const [err, record] = await to(
        pb.collection('attendance_records').getOne(attendanceId, {
            expand: 'lessonId,activityId',
        })
    );

    if (err) {
        if (err.status === 404) {
            return c.error(404, '签到记录不存在');
        }
        console.error('查询签到详情失败:', err);
        return c.error(500, '查询失败，请稍后再试');
    }

    const owner = resolveRelationId(record.userId);
    if (owner !== user.id && process.env.ALLOW_ATTENDANCE_FALLBACK === 'false') {
        return c.error(403, '无权访问该签到记录');
    }

    return c.data(mapAttendanceRecord(record), '查询成功');
}

module.exports = { attendanceDetailHandler };
