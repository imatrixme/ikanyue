const { invariant } = require('../domain');
const { escapeFilter, relationId } = require('../queryService');
const { loadTeacherAvailabilityWindows } = require('./availabilityWindows');
const { filterTime } = require('../booking/time');
const {
    CALENDAR_TIMEZONE,
    UPCOMING_SESSION_STATUSES,
    calendarBoolean,
    normalizeCalendarFilters,
    parseCalendarRange,
    upcomingLimit,
} = require('./range');
const {
    buildFacets,
    buildScheduleEntry,
    publicName,
    relationGroups,
    relationsForSession,
} = require('./projection');

const MAX_RANGE_ENTRIES = 500;
const ID_CHUNK_SIZE = 40;
const SESSION_EXPAND = 'requiredCreditTypeId,requiredCreditTypeId.courseSpecId,appointmentId';

class ScheduleQueryService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
    }

    async institution(query = {}) {
        const range = parseCalendarRange(query);
        const filters = normalizeCalendarFilters(query);
        const sessions = await this.rangeSessions(range);
        const entries = await this.projectSessions(sessions, 'admin');
        const facets = buildFacets(entries);
        facets.teachers = mergeFacets(facets.teachers, await this.eligibleTeachers());
        return {
            range: { ...range, timezone: CALENDAR_TIMEZONE },
            filters: serializeFilters(filters),
            facets,
            items: entries.filter((entry) => matchesFilters(entry, filters)),
        };
    }

    async teacherOps(teacherId, query = {}) {
        requiredPrincipal(teacherId, 'CALENDAR_TEACHER_REQUIRED', '教师身份不能为空');
        const range = parseCalendarRange(query);
        const filters = normalizeCalendarFilters(query);
        const sessionIds = await this.scopedSessionIds('session_teachers', 'teacherId', teacherId, range,
            'actualStatus!="cancelled"');
        const sessions = await this.sessionsByIds(sessionIds);
        const entries = await this.projectSessions(sessions, 'admin');
        return {
            range: { ...range, timezone: CALENDAR_TIMEZONE },
            filters: serializeFilters(filters),
            facets: buildFacets(entries),
            items: entries.filter((entry) => matchesFilters(entry, filters)),
        };
    }

    async teacher(teacherId, query = {}) {
        requiredPrincipal(teacherId, 'CALENDAR_TEACHER_REQUIRED', '教师身份不能为空');
        const range = parseCalendarRange(query);
        const sessionIds = await this.scopedSessionIds('session_teachers', 'teacherId', teacherId, range,
            'actualStatus!="cancelled"');
        const sessions = await this.sessionsByIds(sessionIds);
        return {
            range: { ...range, timezone: CALENDAR_TIMEZONE },
            items: await this.projectSessions(sessions, 'teacher'),
            availability: calendarBoolean(query.includeAvailability)
                ? await loadTeacherAvailabilityWindows(this.repository, teacherId, range) : [],
        };
    }

    async learner(studentId, query = {}) {
        requiredPrincipal(studentId, 'CALENDAR_STUDENT_REQUIRED', '学员身份不能为空');
        const range = parseCalendarRange(query);
        const sessionIds = await this.scopedSessionIds('session_students', 'studentId', studentId, range,
            'attendanceStatus!="cancelled"');
        const sessions = await this.sessionsByIds(sessionIds);
        return {
            range: { ...range, timezone: CALENDAR_TIMEZONE },
            items: await this.projectSessions(sessions, 'student'),
        };
    }

    async upcoming(user = {}, query = {}) {
        const limit = upcomingLimit(query.limit);
        const role = user.role === 'teacher' ? 'teacher' : user.role === 'student' ? 'student' : '';
        invariant(role, 'CALENDAR_ROLE_UNSUPPORTED', '当前身份不支持课程日程');
        requiredPrincipal(user.id, 'CALENDAR_PRINCIPAL_REQUIRED', '登录身份不能为空');
        const collection = role === 'teacher' ? 'session_teachers' : 'session_students';
        const field = role === 'teacher' ? 'teacherId' : 'studentId';
        const extra = role === 'teacher' ? 'actualStatus!="cancelled"' : 'attendanceStatus!="cancelled"';
        const now = new Date(this.clock()).toISOString();
        const statusFilter = [...UPCOMING_SESSION_STATUSES]
            .map((status) => `sessionId.status="${status}"`).join(' || ');
        const page = await this.repository.page(collection, 1, 20, {
            filter: `${field}="${escapeFilter(user.id)}" && ${extra} && sessionId.endAt>"${escapeFilter(now)}"`
                + ` && (${statusFilter})`,
            sort: 'sessionId.startAt',
        });
        const ids = unique((page.items || []).map((row) => relationId(row.sessionId)));
        const sessions = await this.sessionsByIds(ids);
        const items = (await this.projectSessions(sessions, role)).sort(byStart).slice(0, limit);
        return { timezone: CALENDAR_TIMEZONE, items };
    }

    async rangeSessions(range) {
        const result = await this.repository.page('sessions', 1, MAX_RANGE_ENTRIES, {
            filter: `endAt>"${escapeFilter(filterTime(range.from))}" && startAt<"${escapeFilter(filterTime(range.to))}"`,
            sort: 'startAt',
            expand: SESSION_EXPAND,
        });
        invariant(Number(result.totalItems || 0) <= MAX_RANGE_ENTRIES,
            'CALENDAR_RANGE_TOO_DENSE', '当前时间范围课程过多，请缩小查询范围', {
                maxEntries: MAX_RANGE_ENTRIES,
            });
        return result.items || [];
    }

    async scopedSessionIds(collection, field, principalId, range, extra) {
        const rows = await this.repository.list(collection, {
            filter: `${field}="${escapeFilter(principalId)}" && ${extra}`
                + ` && sessionId.endAt>"${escapeFilter(filterTime(range.from))}"`
                + ` && sessionId.startAt<"${escapeFilter(filterTime(range.to))}"`,
            sort: 'sessionId.startAt',
        });
        return unique(rows.map((row) => relationId(row.sessionId)));
    }

    async sessionsByIds(ids) {
        if (!ids.length) return [];
        const chunks = chunk(ids, ID_CHUNK_SIZE);
        const pages = await Promise.all(chunks.map((values) => this.repository.list('sessions', {
            filter: anyIdFilter('id', values), sort: 'startAt', expand: SESSION_EXPAND,
        })));
        return pages.flat().sort(byStart);
    }

    async projectSessions(sessions, audience) {
        if (!sessions.length) return [];
        const ids = sessions.map((session) => session.id);
        const [teachers, students, classes] = await Promise.all([
            this.relatedRows('session_teachers', ids, 'teacherId'),
            this.relatedRows('session_students', ids, 'studentId'),
            this.relatedRows('session_classes', ids, 'classId'),
        ]);
        const groups = {
            teachers: relationGroups(teachers),
            students: relationGroups(students),
            classes: relationGroups(classes),
        };
        return sessions.map((session) => buildScheduleEntry(
            session, relationsForSession(session.id, groups), audience
        )).sort(byStart);
    }

    async relatedRows(collection, sessionIds, expand) {
        const chunks = chunk(sessionIds, ID_CHUNK_SIZE);
        const pages = await Promise.all(chunks.map((ids) => this.repository.list(collection, {
            filter: anyIdFilter('sessionId', ids), sort: 'sessionId', expand,
        })));
        return pages.flat();
    }

    async eligibleTeachers() {
        const rows = await this.repository.list('teachers', {
            filter: 'blocked=false && verified=true',
            fields: 'id,realName,realname,nickName,nickname,username,sn',
            sort: 'realName,nickName,username',
        });
        return rows.map((teacher) => ({ id: teacher.id, name: publicName(teacher) }))
            .filter((teacher) => teacher.id);
    }
}

function matchesFilters(entry, filters) {
    return (!filters.teacherId || entry.relationIds.teacherIds.includes(filters.teacherId))
        && (!filters.studentId || entry.relationIds.studentIds.includes(filters.studentId))
        && (!filters.classId || entry.relationIds.classIds.includes(filters.classId))
        && (!filters.courseSpecId || entry.course.courseId === filters.courseSpecId)
        && (!filters.statuses.length || filters.statuses.includes(entry.rawStatus))
        && (!filters.origins.length || filters.origins.includes(entry.originType));
}

function serializeFilters(filters) {
    return {
        teacherId: filters.teacherId,
        studentId: filters.studentId,
        classId: filters.classId,
        courseSpecId: filters.courseSpecId,
        status: filters.statuses,
        originType: filters.origins,
    };
}

function anyIdFilter(field, ids) {
    return `(${ids.map((id) => `${field}="${escapeFilter(id)}"`).join(' || ')})`;
}

function chunk(values, size) {
    const result = [];
    for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
    return result;
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function mergeFacets(...groups) {
    const values = new Map();
    for (const item of groups.flat()) {
        if (item?.id && !values.has(item.id)) values.set(item.id, item);
    }
    return [...values.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

function byStart(left, right) {
    const timeOrder = Date.parse(left.startAt || '') - Date.parse(right.startAt || '');
    if (Number.isFinite(timeOrder) && timeOrder !== 0) return timeOrder;
    return String(left.lessonId || left.id).localeCompare(String(right.lessonId || right.id));
}

function requiredPrincipal(value, code, message) {
    invariant(typeof value === 'string' && value, code, message);
}

module.exports = {
    ID_CHUNK_SIZE,
    MAX_RANGE_ENTRIES,
    ScheduleQueryService,
    anyIdFilter,
    chunk,
    matchesFilters,
    mergeFacets,
    serializeFilters,
};
