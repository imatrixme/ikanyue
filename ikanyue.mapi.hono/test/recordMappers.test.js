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
