const { lessonStatus } = require('../studentLearningService');
const { relation, relationId } = require('../queryService');
const { sanitizeStudentText } = require('../studentLearningContract');

function buildScheduleEntry(session, relations, audience) {
    const type = relation(session, 'requiredCreditTypeId');
    const course = relation(type, 'courseSpecId');
    const teachers = relations.teachers.map((row) => personRelation(row, 'teacherId', row.role));
    const students = relations.students.map((row) => personRelation(row, 'studentId'));
    const classes = relations.classes.map((row) => classRelation(row));
    const appointment = relation(session, 'appointmentId');
    const entry = {
        lessonId: session.id,
        title: clean(session.title || course.name || type.name || '课程'),
        course: {
            courseId: course.id || relationId(type.courseSpecId) || type.id || relationId(session.requiredCreditTypeId),
            name: clean(course.name || type.name || '课程'),
            deliveryMode: course.deliveryMode || '',
        },
        startAt: session.startAt || null,
        endAt: session.endAt || null,
        location: clean(session.location || ''),
        status: lessonStatus(session.status),
        rawStatus: session.status || '',
        originType: session.originType || 'admin',
        adjusted: appointment.status === 'rescheduled',
        attention: attentionFor(session.status),
        teacherSummary: summary(teachers),
        classSummary: summary(classes),
        participantSummary: summary(students, audience === 'student'),
    };
    if (audience === 'admin') {
        return {
            ...entry,
            appointmentId: relationId(session.appointmentId) || null,
            version: positiveVersion(session.version),
            relationIds: {
                teacherIds: teachers.map((item) => item.id),
                studentIds: students.map((item) => item.id),
                classIds: classes.map((item) => item.id),
            },
        };
    }
    delete entry.rawStatus;
    return entry;
}

function relationGroups(rows, field = 'sessionId') {
    const groups = new Map();
    for (const row of rows || []) {
        const id = relationId(row[field]);
        if (!id) continue;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(row);
    }
    return groups;
}

function relationsForSession(id, groups) {
    return {
        teachers: groups.teachers.get(id) || [],
        students: groups.students.get(id) || [],
        classes: groups.classes.get(id) || [],
    };
}

function buildFacets(entries) {
    return {
        teachers: facet(entries.flatMap((entry) => entry.teacherSummary.items)),
        students: facet(entries.flatMap((entry) => entry.participantSummary.items)),
        classes: facet(entries.flatMap((entry) => entry.classSummary.items)),
        courses: facet(entries.map((entry) => ({ id: entry.course.courseId, name: entry.course.name }))),
    };
}

function facet(items) {
    const byId = new Map();
    for (const item of items) if (item?.id && !byId.has(item.id)) byId.set(item.id, { id: item.id, name: item.name });
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

function personRelation(record, field, role = '') {
    const person = relation(record, field);
    return {
        id: person.id || relationId(record[field]),
        name: publicName(person),
        ...(role ? { role } : {}),
    };
}

function classRelation(record) {
    const teachingClass = relation(record, 'classId');
    return {
        id: teachingClass.id || relationId(record.classId),
        name: clean(teachingClass.name || teachingClass.code || '班级课程'),
    };
}

function summary(items, redactItems = false) {
    if (redactItems) return { count: 0, items: [], label: '', overflow: 0 };
    const visible = items.slice(0, 3);
    return {
        count: items.length,
        items: visible,
        label: items.length ? items.map((item) => item.name).slice(0, 3).join('、') : '',
        overflow: Math.max(0, items.length - visible.length),
    };
}

function publicName(person = {}) {
    return clean(person.realName || person.realname || person.nickName || person.nickname
        || person.username || person.sn || '未命名');
}

function attentionFor(status) {
    return status === 'correction_pending' ? '教务处理中' : '';
}

function positiveVersion(value) {
    const version = Number(value);
    return Number.isInteger(version) && version > 0 ? version : 1;
}

function clean(value) {
    return sanitizeStudentText(String(value || ''));
}

module.exports = {
    buildFacets,
    buildScheduleEntry,
    publicName,
    relationGroups,
    relationsForSession,
};
