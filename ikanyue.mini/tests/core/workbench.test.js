import { describe, expect, it } from 'vitest';
import {
    buildGrantPayload, confirmLessonPayload, handoverSummary, normalizeHandoverPreview, normalizeTeacherLessons, normalizeTeachers,
    substituteOptions, teacherUrl, filterLessonsByTeacher, normalizeLedger, normalizePackages,
    normalizePendingLessons, normalizeStudentPage, teacherFilterOptions, validateNewStudent, workbenchErrorMessage,
    workbenchMissing, workbenchSections,
} from '../../miniprogram/core/workbench.js';

const owner = {
    permissions: { teach: true, manageStudents: true, grant: true, undo: true, allLessons: true },
    teacherCount: 1, pendingLessonCount: 2, pendingRequestCount: 1,
};

describe('workbench sections follow permissions', () => {
    it('shows every section to a solo owner without teacher names', () => {
        expect(workbenchSections(owner)).toEqual({
            available: true, teach: true, students: true, grant: true, undo: true, allLessons: true, showTeachers: false,
            teachers: false,
        });
    });

    it('shows only teaching to a hired teacher and teacher names once there are two teachers', () => {
        const hired = { permissions: { teach: true }, teacherCount: 2 };
        expect(workbenchSections(hired)).toMatchObject({ teach: true, students: false, grant: false, undo: false, showTeachers: true, teachers: false });
    });

    it('offers teacher management only to an owner with a second teacher', () => {
        expect(workbenchSections({ ...owner, teacherCount: 2 })).toMatchObject({ students: true, teachers: true });
    });

    it('keeps the original workbench when the summary is missing', () => {
        expect(workbenchSections(null)).toMatchObject({ available: false, teach: false, students: false });
        expect(workbenchMissing({ code: 404 })).toBe(true);
        expect(workbenchMissing({ httpStatus: 404 })).toBe(true);
        expect(workbenchMissing({ code: 403 })).toBe(false);
    });
});

describe('waiting lessons', () => {
    const payload = {
        items: [
            { sessionId: 's1', title: '声乐一对一', startAt: '2026-10-30T02:00:00.000Z', endAt: '2026-10-30T03:00:00.000Z',
                location: '一号琴房', teachers: ['王老师'], students: [{ sessionStudentId: 'r1', name: '小林', attendanceStatus: 'scheduled' }] },
            { sessionId: 's2', title: '视唱练耳', reconfirm: true, teachers: ['李老师'], students: [] },
        ],
    };

    it('hides teacher names in a solo studio and shows them with two teachers', () => {
        const [solo] = normalizePendingLessons(payload);
        expect(solo).toMatchObject({ sessionId: 's1', teacherLabel: '', studentLabel: '小林', location: '一号琴房' });
        expect(solo.students).toEqual([{ sessionStudentId: 'r1', name: '小林', attendance: '待确认' }]);
        expect(solo.timeLabel).toBe('10月30日 周五 10:00-11:00');
        const [, team] = normalizePendingLessons(payload, { showTeachers: true });
        expect(team).toMatchObject({ teacherLabel: '李老师', reconfirm: true, studentLabel: '暂无学员' });
    });

    it('filters by teacher name', () => {
        const lessons = normalizePendingLessons(payload, { showTeachers: true });
        expect(teacherFilterOptions(lessons).map((option) => option.label)).toEqual(['全部老师', '王老师', '李老师']);
        expect(filterLessonsByTeacher(lessons, '李老师').map((lesson) => lesson.sessionId)).toEqual(['s2']);
        expect(filterLessonsByTeacher(lessons, '')).toHaveLength(2);
    });

    it('sends absences only when someone is absent', () => {
        expect(confirmLessonPayload([])).toEqual({});
        expect(confirmLessonPayload(['b', 'a', 'b', ''])).toEqual({ absentSessionStudentIds: ['a', 'b'] });
    });
});

describe('students and granting', () => {
    it('maps the student directory', () => {
        expect(normalizeStudentPage({ items: [{ id: 'st', realName: '林小语', cellphone: '138', blocked: false }],
            pagination: { page: 1, totalPages: 3 } })).toEqual({
            items: [{ studentId: 'st', name: '林小语', initial: '林', cellphone: '138', blocked: false }], page: 1, totalPages: 3,
        });
    });

    it('validates a new student', () => {
        expect(validateNewStudent({ realName: ' ', cellphone: '13800000000' }).error).toBe('请填写学员姓名');
        expect(validateNewStudent({ realName: '林', cellphone: '123' }).error).toBe('请填写 11 位手机号');
        expect(validateNewStudent({ realName: ' 林 ', cellphone: '138 0000 0000' }).payload)
            .toEqual({ realName: '林', cellphone: '13800000000' });
    });

    const packages = normalizePackages({
        items: [
            { packageId: 'p10', name: '十节声乐', validityDurationDays: 180,
                grants: [{ name: '声乐课时', quantity: 10, unitLabel: '节' }],
                prices: [{ priceVersionId: 'v1', listAmount: 3000, saleAmount: 2800 }] },
            { packageId: 'none', name: '没有价格', grants: [], prices: [] },
        ],
    });

    it('lists only packages with a price', () => {
        expect(packages).toEqual([{
            packageId: 'p10', name: '十节声乐', grantLabel: '声乐课时 10 节', validityLabel: '有效期 180 天',
            prices: [{ priceVersionId: 'v1', listAmount: 3000, saleAmount: 2800, label: '售价 ¥2800（标价 ¥3000）' }],
        }]);
    });

    it('builds a discounted grant and its confirmation text', () => {
        expect(buildGrantPayload({ packageId: 'p10', priceVersionId: 'v1', paidAmount: '2700' }, packages)).toEqual({
            payload: { packageId: 'p10', priceVersionId: 'v1', paidAmount: 2700 },
            summary: '十节声乐，声乐课时 10 节，标价 ¥3000，实收 ¥2700',
        });
        expect(buildGrantPayload({ packageId: 'p10', paidAmount: '' }, packages).payload).toEqual({ packageId: 'p10', priceVersionId: 'v1' });
        expect(buildGrantPayload({ packageId: 'p10', paidAmount: '12.345' }, packages).error).toBe('实收金额最多两位小数');
        expect(buildGrantPayload({ packageId: 'missing' }, packages).error).toBe('请选择课包');
    });
});

describe('student ledger', () => {
    it('maps courses, confirmed lessons and records in lesson language', () => {
        const ledger = normalizeLedger({
            student: { studentId: 'st', name: '林小语', cellphone: '138' },
            overview: { courses: [{ courseId: 'c', courseName: '声乐', remainingLessons: 8, scheduledLessons: 1, completedLessons: 1 }] },
            confirmedLessons: [{ lessonId: 's1', title: '声乐一对一', startAt: '2026-10-30T02:00:00.000Z', attendanceResult: 'absent' }],
            records: { items: [{ recordId: 'r', title: '课时已发放', course: { name: '声乐' }, lessonHours: 10, impact: 'added' }] },
        });
        expect(ledger.courses).toEqual([{ courseId: 'c', name: '声乐', remaining: 8, scheduled: 1, completed: 1 }]);
        expect(ledger.confirmedLessons).toEqual([{ sessionId: 's1', title: '声乐一对一', timeLabel: '10月30日 周五 10:00', attendance: '缺席' }]);
        expect(ledger.records).toEqual([{ recordId: 'r', title: '课时已发放', course: '声乐', change: '+10 课时' }]);
    });

    it('explains refusals without raw codes', () => {
        expect(workbenchErrorMessage({ errorCode: 'LESSON_NOT_STARTED' })).toBe('课程开始后才能确认上课。');
        expect(workbenchErrorMessage({ code: 403, errorCode: 'OTHER' })).toBe('当前账号没有这项权限。');
        expect(workbenchErrorMessage({}, '稍后再试')).toBe('稍后再试');
    });
});

describe('substitution and handover', () => {
    const teachers = normalizeTeachers({ items: [
        { teacherId: 't1', name: '王老师', lessonCount: 3, pendingRequestCount: 1 },
        { teacherId: 't2', name: '李老师', lessonCount: 0, isAdmin: true },
        { name: '没有编号' },
    ] });

    it('lists teachers with what they still have', () => {
        expect(teachers).toEqual([
            { teacherId: 't1', name: '王老师', initial: '王', isAdmin: false, description: '3 节课未确认 · 1 条约课待处理' },
            { teacherId: 't2', name: '李老师', initial: '李', isAdmin: true, description: '0 节课未确认' },
        ]);
        expect(teacherUrl('t1')).toBe('/pages/workbenchTeacher/index?id=t1');
    });

    it('offers every other teacher as a substitute', () => {
        expect(substituteOptions(teachers, 't1')).toEqual([{ label: '李老师', value: 't2' }]);
        expect(substituteOptions(teachers, '')).toHaveLength(2);
    });

    it('labels a teacher\'s lessons as started or not', () => {
        const { teacher, lessons } = normalizeTeacherLessons({ teacher: { teacherId: 't1', name: '王老师' },
            items: [{ sessionId: 's1', started: true, leadTeacherId: 't1' }, { sessionId: 's2' }] });
        expect(teacher).toEqual({ teacherId: 't1', name: '王老师', isAdmin: false });
        expect(lessons.map((lesson) => [lesson.sessionId, lesson.stateLabel, lesson.leadTeacherId]))
            .toEqual([['s1', '已开课，待确认', 't1'], ['s2', '未开始', '']]);
    });

    it('summarizes a handover and blocks it on conflicts', () => {
        const preview = normalizeHandoverPreview({
            lessons: [{ sessionId: 's1' }, { sessionId: 's2' }], conflicts: [],
            pendingRequests: [{ appointmentId: 'a1', student: '小林', startAt: '2026-10-30T02:00:00.000Z', endAt: '2026-10-30T03:00:00.000Z' }],
            offerings: [{ courseName: '声乐', receiverOffers: false }, { courseName: '钢琴', receiverOffers: true }],
            students: ['小林'],
        });
        expect(preview).toMatchObject({ lessonCount: 2, studentLabel: '小林', unopenedLabel: '声乐', canSubmit: true });
        expect(preview.requests[0].label).toBe('小林 · 10月30日 周五 10:00-11:00');
        expect(handoverSummary(preview, '王老师', '李老师'))
            .toBe('2 节课改由李老师上，婉拒 1 条约课申请，关闭王老师的开放预约并停用账号，学员课时不变');
        expect(normalizeHandoverPreview({ conflicts: [{ sessionId: 's1' }] }).canSubmit).toBe(false);
    });

    it('explains substitution refusals', () => {
        expect(workbenchErrorMessage({ errorCode: 'SUBSTITUTE_TEACHER_BUSY' })).toBe('这位老师在这个时间已有课。');
        expect(workbenchErrorMessage({ errorCode: 'HANDOVER_CONFLICTS' })).toBe('接手老师有课时间冲突，请先单独调整这些课。');
    });
});
