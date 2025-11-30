/**
 * 上课记录详情接口
 * GET /v1/lesson-record/detail
 * GET /v1/lesson-record/:id
 */

const to = require('await-to-js').default;
const pb = require('../../utils/pocketbase');
const { mapLessonRecord, resolveRelationId } = require('../../utils/recordMappers');

function extractLessonId(c) {
    const params = c.req.param();
    if (params?.id) {
        return params.id;
    }
    const query = c.req.query();
    return query.id || query.lessonId || '';
}

async function lessonRecordDetailHandler(c) {
    const user = c.get('user');
    if (!user?.id) {
        return c.error(403, '未授权，请重新登录');
    }

    const lessonId = extractLessonId(c);
    if (!lessonId) {
        return c.error(400, '缺少上课记录 ID');
    }

    const [err, record] = await to(
        pb.collection('lesson_records').getOne(lessonId, {
            expand: 'attendanceId',
        })
    );

    if (err) {
        if (err.status === 404) {
            return c.error(404, '上课记录不存在');
        }
        console.error('查询上课详情失败:', err);
        return c.error(500, '查询失败，请稍后再试');
    }

    const owner = resolveRelationId(record.userId);
    if (owner !== user.id && process.env.ALLOW_LESSON_FALLBACK === 'false') {
        return c.error(403, '无权访问该上课记录');
    }

    return c.data(mapLessonRecord(record), '查询成功');
}

module.exports = { lessonRecordDetailHandler };
