const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditClassMembershipService } = require('../src/services/courseCredits/classMembershipService');
const { PocketBaseBatchRepository } = require('../src/services/courseCredits/repositories');
const { CourseCreditSessionPublicationService } = require('../src/services/courseCredits/sessionPublicationService');
const {
    connectLocalPocketBase,
    deleteByFilter,
    deleteOne,
    integrationMarker,
} = require('./support/courseCreditPocketBaseIntegration');

test('real PocketBase persists teaching commands through Hono SDK batches without business hooks', {
    skip: process.env.PB_COURSE_CREDIT_INTEGRATION !== '1',
}, async () => {
    const pb = await connectLocalPocketBase();
    const marker = integrationMarker('teaching');
    const created = {
        classIds: [], operationIds: [], outboxAggregateIds: [], teacherIds: [],
    };
    const repository = new PocketBaseBatchRepository(pb);
    const memberships = new CourseCreditClassMembershipService(repository);
    const publication = new CourseCreditSessionPublicationService(repository);
    const now = Date.now();
    const effectiveFrom = new Date(now - 86400000).toISOString();
    const sessionStart = new Date(now + 2 * 86400000).toISOString();
    const sessionEnd = new Date(now + 2 * 86400000 + 3600000).toISOString();

    try {
        const actors = await ensureActors(pb, marker, created);
        const studentId = actors.student.id;
        const leadTeacherId = actors.teachers[0].id;
        const substituteTeacherId = actors.teachers[1].id;
        created.courseSpec = await pb.collection('course_specs').create({
            code: `IT-TEACH-${marker}`,
            name: `Teaching integration ${marker}`,
            deliveryMode: 'group',
            durationMinutes: 60,
            teacherTier: 'integration',
            status: 'active',
        }, { requestKey: null });
        created.creditType = await pb.collection('credit_types').create({
            code: `IT-TEACH-CREDIT-${marker}`,
            name: `Teaching credit ${marker}`,
            kind: 'course',
            courseSpecId: created.courseSpec.id,
            consumable: true,
            unitLabel: 'lesson',
            referenceUnitValue: 300,
            status: 'active',
        }, { requestKey: null });
        for (const suffix of ['a', 'b']) {
            const classRecord = await pb.collection('classes').create({
                code: `IT-CLASS-${suffix}-${marker}`,
                name: `Integration class ${suffix} ${marker}`,
                courseSpecId: created.courseSpec.id,
                defaultCreditTypeId: created.creditType.id,
                status: 'active',
            }, { requestKey: null });
            created.classIds.push(classRecord.id);
        }

        for (const [index, classId] of created.classIds.entries()) {
            const member = await memberships.setStudentMembership({
                classId,
                studentId,
                status: 'active',
                effectiveFrom,
                idempotencyKey: `it-member-${marker}-${index}`,
                actorId: 'integration-test',
            });
            const teacher = await memberships.setTeacherAssignment({
                classId,
                teacherId: leadTeacherId,
                role: 'lead',
                status: 'active',
                effectiveFrom,
                idempotencyKey: `it-teacher-${marker}-${index}`,
                actorId: 'integration-test',
            });
            created.operationIds.push(member.operationId, teacher.operationId);
            created.outboxAggregateIds.push(member.membershipId, teacher.assignmentId);
        }

        created.session = await pb.collection('sessions').create({
            code: `IT-PUBLISH-${marker}`,
            title: `Publishing integration ${marker}`,
            status: 'draft',
            originType: 'class',
            startAt: sessionStart,
            endAt: sessionEnd,
            requiredCreditTypeId: created.creditType.id,
            requiredQuantity: 1,
            attendanceRuleSnapshot: {
                version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume',
            },
            settlementRuleSnapshot: { version: 1, cancelled: 'release' },
            teacherRuleSnapshot: {
                version: 1,
                rules: {
                    lead: {
                        ruleId: `teacher-rule-${marker}`,
                        courseSpecId: created.courseSpec.id,
                        baseQuantity: 1,
                        durationFactor: 0,
                        participantFactor: 0,
                    },
                },
            },
            rosterVersion: 1,
            version: 1,
        }, { requestKey: null });

        const publishInput = {
            sessionId: created.session.id,
            classIds: [...created.classIds].reverse(),
            teacherOverrides: [{
                teacherId: substituteTeacherId,
                role: 'lead',
                assignmentSource: 'substitute',
                actualStatus: 'confirmed',
            }],
            idempotencyKey: `it-publish-${marker}`,
            actorId: 'integration-test',
        };
        const published = await publication.publishSession(publishInput);
        created.operationIds.push(published.operationId);
        created.outboxAggregateIds.push(created.session.id);
        assert.equal((await publication.publishSession(publishInput)).replayed, true);

        const [storedSession, sessionClasses, roster, sessionTeachers] = await Promise.all([
            pb.collection('sessions').getOne(created.session.id, { requestKey: null }),
            pb.collection('session_classes').getFullList({
                filter: `sessionId="${created.session.id}"`, requestKey: null,
            }),
            pb.collection('session_students').getFullList({
                filter: `sessionId="${created.session.id}"`, requestKey: null,
            }),
            pb.collection('session_teachers').getFullList({
                filter: `sessionId="${created.session.id}"`, requestKey: null,
            }),
        ]);
        assert.equal(storedSession.status, 'scheduled');
        assert.equal(storedSession.version, 2);
        assert.equal(sessionClasses.length, 2);
        assert.equal(roster.length, 1);
        assert.equal(roster[0].studentId, studentId);
        assert.deepEqual(roster[0].sourceClassIds.sort(), [...created.classIds].sort());
        assert.deepEqual(sessionTeachers.map(({ teacherId, role, assignmentSource, actualStatus }) => ({
            teacherId, role, assignmentSource, actualStatus,
        })), [{
            teacherId: substituteTeacherId,
            role: 'lead',
            assignmentSource: 'substitute',
            actualStatus: 'confirmed',
        }]);

        const paused = await memberships.setStudentMembership({
            classId: created.classIds[0],
            studentId,
            status: 'paused',
            effectiveFrom: new Date(now + 86400000).toISOString(),
            idempotencyKey: `it-pause-${marker}`,
            actorId: 'integration-test',
        });
        created.operationIds.push(paused.operationId);
        created.outboxAggregateIds.push(paused.membershipId);
        const historicalRoster = await pb.collection('session_students').getOne(roster[0].id, { requestKey: null });
        assert.deepEqual(historicalRoster.sourceClassIds.sort(), [...created.classIds].sort());

        for (const operationId of created.operationIds) {
            const [events, batches] = await Promise.all([
                pb.collection('credit_events').getFullList({ filter: `operationId="${operationId}"`, requestKey: null }),
                pb.collection('credit_batches').getFullList({ filter: `sourceOperationId="${operationId}"`, requestKey: null }),
            ]);
            assert.equal(events.length, 0);
            assert.equal(batches.length, 0);
        }
        const allocations = await pb.collection('session_credit_allocations').getFullList({
            filter: `sessionStudentId="${roster[0].id}"`, requestKey: null,
        });
        assert.equal(allocations.length, 0);
    } finally {
        await cleanup(pb, created);
    }
});

async function cleanup(pb, created) {
    if (created.session?.id) {
        await deleteByFilter(pb, 'schedule_claims', `sourceId="${created.session.id}"`);
        const sessionStudents = await pb.collection('session_students').getFullList({
            filter: `sessionId="${created.session.id}"`, requestKey: null,
        });
        for (const sessionStudent of sessionStudents) {
            await deleteByFilter(pb, 'session_credit_allocations', `sessionStudentId="${sessionStudent.id}"`);
        }
        await deleteByFilter(pb, 'session_teachers', `sessionId="${created.session.id}"`);
        await deleteByFilter(pb, 'session_students', `sessionId="${created.session.id}"`);
        await deleteByFilter(pb, 'session_classes', `sessionId="${created.session.id}"`);
    }
    for (const aggregateId of created.outboxAggregateIds || []) {
        await deleteByFilter(pb, 'outbox_events', `aggregateId="${aggregateId}"`);
    }
    for (const operationId of created.operationIds || []) {
        await deleteByFilter(pb, 'credit_version_claims', `operationId="${operationId}"`);
    }
    for (const classId of created.classIds || []) {
        await deleteByFilter(pb, 'class_students', `classId="${classId}"`);
        await deleteByFilter(pb, 'class_teachers', `classId="${classId}"`);
    }
    await deleteOne(pb, 'sessions', created.session?.id);
    for (const operationId of [...(created.operationIds || [])].reverse()) {
        await deleteOne(pb, 'credit_operations', operationId);
    }
    for (const classId of [...(created.classIds || [])].reverse()) await deleteOne(pb, 'classes', classId);
    await deleteOne(pb, 'credit_types', created.creditType?.id);
    await deleteOne(pb, 'course_specs', created.courseSpec?.id);
    for (const teacherId of [...(created.teacherIds || [])].reverse()) await deleteOne(pb, 'teachers', teacherId);
    await deleteOne(pb, 'students', created.studentId);
}

async function ensureActors(pb, marker, created) {
    const student = await pb.collection('students').create({
        sn: `it-student-${marker}`,
    }, { requestKey: null });
    created.studentId = student.id;
    const teachers = [];
    for (let index = 0; index < 2; index += 1) {
        const password = 'LocalTeacher-2026!';
        const teacher = await pb.collection('teachers').create({
            sn: `it-teacher-${index}-${marker}`,
            username: `it-teacher-${index}-${marker}`,
            email: `it-teacher-${index}-${marker}@ikanyue.invalid`,
            emailVisibility: false,
            cellphone: `199${Date.now().toString().slice(-8)}${index}`,
            idcard: `IT${marker.replaceAll('-', '').slice(-14)}${index}`,
            password,
            passwordConfirm: password,
            blocked: false,
            verified: true,
        }, { requestKey: null });
        teachers.push(teacher);
        created.teacherIds.push(teacher.id);
    }
    return { student, teachers };
}
