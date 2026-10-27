const test = require('node:test');
const assert = require('node:assert/strict');

const {
    mapAttendanceRecord,
    mapLessonRecord,
    resolveRelationId,
} = require('../src/utils/recordMappers');
const { mapActivitySignupRecord } = require('../src/utils/activitySignupMappers');

test('resolveRelationId supports empty, scalar, and relation array values', () => {
    assert.equal(resolveRelationId(null), '');
    assert.equal(resolveRelationId('student_1'), 'student_1');
    assert.equal(resolveRelationId(['student_2', 'student_3']), 'student_2');
    assert.equal(resolveRelationId([]), '');
});

test('mapAttendanceRecord maps defaults and expanded activity data', () => {
    const mapped = mapAttendanceRecord({
        id: 'attendance_1',
        userId: ['student_1'],
        activityId: 'activity_1',
        created: '2026-05-14T01:00:00Z',
        expand: {
            activityId: {
                id: 'activity_1',
                title: '声乐体验课',
                location: '上海',
            },
        },
    });

    assert.equal(mapped.userId, 'student_1');
    assert.equal(mapped.status, 'pending');
    assert.equal(mapped.signedAt, '2026-05-14T01:00:00Z');
    assert.equal(mapped.activityTitle, '声乐体验课');
    assert.deepEqual(mapped.activity, {
        id: 'activity_1',
        title: '声乐体验课',
        startTime: null,
        endTime: null,
        location: '上海',
    });
});

test('mapLessonRecord embeds attendance details when attendance is expanded', () => {
    const mapped = mapLessonRecord({
        id: 'lesson_record_1',
        userId: 'student_1',
        activityId: 'activity_1',
        attendanceId: 'attendance_1',
        title: '第一节课',
        expand: {
            attendanceId: {
                id: 'attendance_expand_1',
                userId: 'student_1',
                activityId: 'activity_1',
                status: 'signed',
                signedAt: '2026-05-14T02:00:00Z',
            },
        },
    });

    assert.equal(mapped.attendanceId, 'attendance_expand_1');
    assert.equal(mapped.attendanceStatus, 'signed');
    assert.equal(mapped.attendanceSignedAt, '2026-05-14T02:00:00Z');
    assert.equal(mapped.attendance.status, 'signed');
    assert.equal(mapped.status, 'scheduled');
});

test('mapActivitySignupRecord maps activity expansion with file URLs and defaults', () => {
    const previousPbUrl = process.env.PB_URL;
    process.env.PB_URL = 'https://pb.example.com';

    try {
        const mapped = mapActivitySignupRecord({
            id: 'signup_1',
            userId: ['student_1'],
            activityId: ['activity_1'],
            realname: '王同学',
            expand: {
                activityId: {
                    id: 'activity_1',
                    collectionId: 'activities',
                    title: '声乐公开课',
                    coverImage: 'cover.jpg',
                    images: ['one.jpg', 'two.jpg'],
                    max_participants: 30,
                    current_participants: 8,
                },
            },
        });

        assert.equal(mapped.userId, 'student_1');
        assert.equal(mapped.realName, '王同学');
        assert.equal(mapped.status, 'registered');
        assert.equal(mapped.activity.maxParticipants, 30);
        assert.equal(mapped.activity.currentParticipants, 8);
        assert.equal(
            mapped.activity.coverImageUrl,
            'https://pb.example.com/api/files/activities/activity_1/cover.jpg'
        );
        assert.deepEqual(mapped.activity.imageUrls, [
            'https://pb.example.com/api/files/activities/activity_1/one.jpg',
            'https://pb.example.com/api/files/activities/activity_1/two.jpg',
        ]);
    } finally {
        if (previousPbUrl === undefined) {
            delete process.env.PB_URL;
        } else {
            process.env.PB_URL = previousPbUrl;
        }
    }
});

test('mapAttendanceRecord maps expanded lessons and supports disabling lesson embedding', () => {
    const record = {
        id: 'attendance_2',
        userId: 'student_2',
        lessonId: ['lesson_1'],
        status: 'signed',
        signedAt: '2026-05-14T03:00:00Z',
        expand: {
            lessonId: {
                id: 'lesson_1',
                title: '视唱练耳',
                teacher: '李老师',
                location: '教室A',
                status: 'done',
            },
        },
    };

    const withLesson = mapAttendanceRecord(record);
    assert.deepEqual(withLesson.lesson, {
        id: 'lesson_1',
        title: '视唱练耳',
        teacher: '李老师',
        startTime: null,
        endTime: null,
        location: '教室A',
        status: 'done',
    });

    const withoutLesson = mapAttendanceRecord(record, { includeLesson: false });
    assert.equal('lesson' in withoutLesson, false);
});

test('record mappers return null for empty records and map inline attendance records', () => {
    assert.equal(mapAttendanceRecord(null), null);
    assert.equal(mapLessonRecord(undefined), null);
    assert.equal(mapActivitySignupRecord(null), null);

    const mapped = mapLessonRecord({
        id: 'lesson_record_2',
        userId: ['student_2'],
        activityId: ['activity_2'],
        attendanceId: ['attendance_2'],
        attendance: {
            id: 'attendance_inline',
            userId: 'student_2',
            status: 'pending',
            created: '2026-05-14T04:00:00Z',
        },
        materials: [{ id: 'material_1' }],
    });

    assert.equal(mapped.userId, 'student_2');
    assert.deepEqual(mapped.materials, [{ id: 'material_1' }]);
    assert.equal(mapped.attendance.id, 'attendance_inline');
    assert.equal(mapped.attendance.signedAt, '2026-05-14T04:00:00Z');
});

test('mapActivitySignupRecord handles camelCase activity fields and missing expansion', () => {
    const withoutActivity = mapActivitySignupRecord({
        id: 'signup_2',
        userId: 'student_2',
        activityId: 'activity_2',
        realName: '李同学',
        age: 12,
        status: 'cancelled',
    });

    assert.equal(withoutActivity.realName, '李同学');
    assert.equal(withoutActivity.age, 12);
    assert.equal(withoutActivity.status, 'cancelled');
    assert.equal(withoutActivity.activity, null);

    const withActivity = mapActivitySignupRecord({
        id: 'signup_3',
        userId: 'student_3',
        activityId: 'activity_3',
        expand: {
            activityId: {
                id: 'activity_3',
                collectionId: 'activities',
                description: '体验活动',
                tags: ['声乐'],
                maxParticipants: 10,
                currentParticipants: 5,
                externalLink: 'https://example.com/activity',
            },
        },
    });

    assert.equal(withActivity.activity.maxParticipants, 10);
    assert.equal(withActivity.activity.currentParticipants, 5);
    assert.equal(withActivity.activity.externalLink, 'https://example.com/activity');
    assert.deepEqual(withActivity.activity.tags, ['声乐']);
});
