const LEGACY_COLLECTIONS = Object.freeze({
    students: 'students',
    teachers: 'teachers',
    programs: 'learning_programs',
    sessions: 'learning_sessions',
    lessons: 'lesson_records',
    attendance: 'attendance_records',
});

const TARGET_COLLECTIONS = Object.freeze({
    classes: 'classes',
    creditTypes: 'credit_types',
    packages: 'packages',
});

class CourseCreditMigrationInventoryService {
    constructor(repository) {
        this.repository = repository;
    }

    async inventory() {
        const entries = await Promise.all(Object.entries(LEGACY_COLLECTIONS).map(async ([name, collection]) => (
            [name, await optionalList(this.repository, collection)]
        )));
        const targetEntries = await Promise.all(Object.entries(TARGET_COLLECTIONS).map(async ([name, collection]) => (
            [name, await optionalList(this.repository, collection)]
        )));
        const data = Object.fromEntries(entries);
        const targets = Object.fromEntries(targetEntries);
        const studentHours = data.students.records.filter(hasLegacyHours).map(projectHours);
        const teacherHours = data.teachers.records.filter(hasLegacyHours).map(projectHours);
        const legacySessions = mergeSessions(data.sessions.records, data.lessons.records);
        return {
            availability: Object.fromEntries(entries.map(([name, result]) => [name, result.available])),
            attendance: data.attendance.records.map(projectAttendance),
            programs: data.programs.records.map(projectProgram),
            sessions: legacySessions.map(projectSession),
            studentHours,
            targets: {
                classes: targets.classes.records.map(projectTarget),
                creditTypes: targets.creditTypes.records.filter(isConsumableCourseCredit).map(projectTarget),
                packages: targets.packages.records.map(projectTarget),
            },
            teacherHours,
            totals: {
                attendance: data.attendance.records.length,
                programs: data.programs.records.length,
                sessions: legacySessions.length,
                studentHours: sumHours(studentHours),
                students: studentHours.length,
                teacherHours: sumHours(teacherHours),
                teachers: teacherHours.length,
            },
        };
    }
}

function isConsumableCourseCredit(record) {
    return record.kind === 'course' && record.consumable === true && record.status !== 'inactive';
}

function projectTarget(record) {
    return {
        code: String(record.code || ''),
        id: String(record.id || ''),
        name: String(record.name || record.title || record.code || record.id || ''),
        status: String(record.status || ''),
    };
}

async function optionalList(repository, collection) {
    try {
        return { available: true, records: await repository.list(collection, { sort: 'created,id' }) };
    } catch (error) {
        if (error?.status === 404 || error?.code === 404) return { available: false, records: [] };
        throw error;
    }
}

function hasLegacyHours(record) {
    return Object.hasOwn(record || {}, 'hours') && Number.isFinite(Number(record.hours)) && Number(record.hours) !== 0;
}

function projectHours(record) {
    return { id: record.id, label: recordLabel(record), hours: Number(record.hours) };
}

function projectProgram(record) {
    return { id: record.id, name: String(record.name || record.title || recordLabel(record)) };
}

function projectSession(record) {
    return {
        endAt: stringValue(record.endAt || record.endTime),
        id: record.id,
        startAt: stringValue(record.startAt || record.startTime || record.created),
        studentId: relationValue(record.studentId || record.userId),
        teacherId: relationValue(record.teacherId),
        title: String(record.title || record.name || `历史课堂 ${record.id}`),
    };
}

function projectAttendance(record) {
    return {
        id: record.id,
        sessionId: relationValue(record.sessionId || record.lessonId),
        status: String(record.attendanceStatus || record.status || ''),
        studentId: relationValue(record.studentId || record.userId),
    };
}

function mergeSessions(sessions, lessons) {
    const result = new Map([...sessions, ...lessons].map((record) => [record.id, record]));
    return [...result.values()];
}

function relationValue(value) {
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function stringValue(value) {
    return value ? String(value) : '';
}

function recordLabel(record) {
    return String(record.realName || record.realname || record.nickName || record.nickname
        || record.username || record.sn || record.id || '未命名');
}

function sumHours(items) {
    return items.reduce((total, item) => total + item.hours, 0);
}

module.exports = {
    CourseCreditMigrationInventoryService,
    LEGACY_COLLECTIONS,
    TARGET_COLLECTIONS,
    hasLegacyHours,
    isConsumableCourseCredit,
    mergeSessions,
    optionalList,
    projectAttendance,
    projectHours,
    projectProgram,
    projectSession,
    projectTarget,
    recordLabel,
};
