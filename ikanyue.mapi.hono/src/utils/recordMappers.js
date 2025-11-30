/**
 * PocketBase 记录映射工具
 * 统一将 attendance_records / lesson_records 转成前端可用的结构
 */

/**
 * 解析 relation 字段（兼容 1:N 以及 N:N）
 * @param {string|string[]} value
 * @returns {string}
 */
function resolveRelationId(value) {
    if (!value) {
        return '';
    }
    return Array.isArray(value) ? value[0] || '' : value;
}

/**
 * 构造课程的简要信息
 * @param {Record<string, any>} lesson
 * @returns {object|null}
 */
function buildLessonSummary(lesson) {
    if (!lesson) {
        return null;
    }
    return {
        id: lesson.id,
        title: lesson.title || '',
        teacher: lesson.teacher || '',
        startTime: lesson.startTime || null,
        endTime: lesson.endTime || null,
        location: lesson.location || '',
        status: lesson.status || 'scheduled',
    };
}

/**
 * 映射签到记录
 * @param {Record<string, any>} record
 * @param {object} options
 * @param {boolean} [options.includeLesson=true]
 * @returns {object|null}
 */
function mapAttendanceRecord(record, options = {}) {
    if (!record) {
        return null;
    }

    const includeLesson = options.includeLesson !== false;
    const lessonExpand = record.expand?.lessonId;
    const activityExpand = record.expand?.activityId;

    const mapped = {
        id: record.id,
        userId: resolveRelationId(record.userId),
        lessonId: resolveRelationId(record.lessonId),
        activityId: resolveRelationId(record.activityId),
        status: record.status || 'pending',
        signedAt: record.signedAt || record.created || null,
        location: record.location || '',
        remark: record.remark || '',
        geo: record.geo || null,
        deviceInfo: record.deviceInfo || null,
        attachments: record.attachments || [],
        activityTitle: record.activityTitle || '',
        created: record.created,
        updated: record.updated,
    };

    if (includeLesson && lessonExpand) {
        mapped.lesson = buildLessonSummary(lessonExpand);
    }
    if (activityExpand) {
        mapped.activity = {
            id: activityExpand.id,
            title: activityExpand.title || '',
            startTime: activityExpand.startTime || null,
            endTime: activityExpand.endTime || null,
            location: activityExpand.location || '',
        };
        mapped.activityTitle = mapped.activity.title;
    }

    return mapped;
}

/**
 * 映射上课记录
 * @param {Record<string, any>} record
 * @returns {object|null}
 */
function mapLessonRecord(record) {
    if (!record) {
        return null;
    }

    const attendanceExpand = record.expand?.attendanceId;

    const mapped = {
        id: record.id,
        userId: resolveRelationId(record.userId),
        activityId: resolveRelationId(record.activityId),
        attendanceId: resolveRelationId(record.attendanceId),
        title: record.title || '',
        teacher: record.teacher || '',
        location: record.location || '',
        startTime: record.startTime || null,
        endTime: record.endTime || null,
        status: record.status || 'scheduled',
        materials: record.materials || null,
        created: record.created,
        updated: record.updated,
    };

    if (attendanceExpand) {
        mapped.attendanceId = attendanceExpand.id;
        mapped.attendanceStatus = attendanceExpand.status;
        mapped.attendanceSignedAt = attendanceExpand.signedAt || attendanceExpand.created || null;
        mapped.attendance = mapAttendanceRecord(attendanceExpand, { includeLesson: false });
    } else if (record.attendance) {
        mapped.attendance = mapAttendanceRecord(record.attendance, { includeLesson: false });
    }

    return mapped;
}

module.exports = {
    mapAttendanceRecord,
    mapLessonRecord,
    resolveRelationId,
};
