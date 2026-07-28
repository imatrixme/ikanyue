const { relation, relationId } = require('../queryService');

function studentAppointment(record) {
    const offering = relation(record, 'offeringId');
    const course = relation(record, 'courseSpecId');
    const teacher = relation(record, 'teacherId');
    const session = relation(record, 'sessionId');
    return {
        appointmentId: record.id,
        status: record.status,
        course: {
            courseId: course.id || relationId(record.courseSpecId),
            name: course.name || offering.courseName || '课程',
        },
        teacher: {
            teacherId: teacher.id || relationId(record.teacherId),
            name: teacher.realName || teacher.realname || teacher.nickName || teacher.nickname || '授课教师',
            avatar: teacher.avatarUrl || teacher.avatar || '',
        },
        startAt: record.requestedStartAt,
        endAt: record.requestedEndAt,
        location: offering.location || session.location || '',
        note: record.note || '',
        responseReason: record.responseReason || '',
        responseDeadline: record.responseDeadline || null,
        lessonId: session.id || relationId(record.sessionId) || '',
        canWithdraw: record.status === 'pending',
        canCancel: record.status === 'confirmed',
    };
}

function teacherAppointment(record) {
    const projected = studentAppointment(record);
    const student = relation(record, 'studentId');
    return {
        ...projected,
        student: {
            studentId: student.id || relationId(record.studentId),
            name: student.realName || student.realname || student.nickName || student.nickname || '学员',
            avatar: student.avatarUrl || student.avatar || '',
        },
        canConfirm: record.status === 'pending',
        canDecline: record.status === 'pending',
        version: Number(record.version || 1),
    };
}

function bookingOption(offering) {
    const course = relation(offering, 'courseSpecId');
    const teacher = relation(offering, 'teacherId');
    return {
        offeringId: offering.id,
        course: {
            courseId: course.id || relationId(offering.courseSpecId),
            name: course.name || '课程',
            durationMinutes: Number(course.durationMinutes || 0),
        },
        teacher: {
            teacherId: teacher.id || relationId(offering.teacherId),
            name: teacher.realName || teacher.realname || teacher.nickName || teacher.nickname || '授课教师',
            avatar: teacher.avatarUrl || teacher.avatar || '',
        },
        location: offering.location || '',
    };
}

module.exports = { bookingOption, studentAppointment, teacherAppointment };
