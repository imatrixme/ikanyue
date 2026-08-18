#!/usr/bin/env node

const crypto = require('node:crypto');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.KANYUE_ENV_FILE || '.env' });

const LOCAL_COURSE = Object.freeze({
    code: 'VOCAL-ADULT-1V1-60',
    name: '成人声乐一对一 60 分钟',
    deliveryMode: 'one_to_one',
    durationMinutes: 60,
    teacherTier: 'local',
    status: 'active',
});

const LOCAL_CREDIT_TYPE = Object.freeze({
    code: 'VOCAL-ADULT-1V1-60-CREDIT',
    name: '成人声乐一对一课时',
    kind: 'course',
    consumable: true,
    unitLabel: 'lesson',
    referenceUnitValue: 300,
    status: 'active',
});

const LOCAL_POLICY = Object.freeze({
    code: 'LOCAL-DEFAULT',
    name: '本地默认预约策略',
    timezone: 'Asia/Shanghai',
    defaultWindows: [
        { startMinute: 9 * 60, endMinute: 12 * 60 },
        { startMinute: 14 * 60, endMinute: 20 * 60 },
    ],
    slotStepMinutes: 30,
    claimGranularityMinutes: 15,
    minLeadMinutes: 60,
    maxAdvanceDays: 30,
    responseTtlMinutes: 24 * 60,
    responseCutoffMinutes: 60,
    cancellationCutoffMinutes: 60,
    version: 1,
    effectiveFrom: '2020-01-01T00:00:00.000Z',
    status: 'active',
});

const LOCAL_TEACHER = Object.freeze({
    id: 'localteacher001',
    sn: 'localteacher001',
    username: 'localteacher',
    email: 'teacher@local.com',
    cellphone: '13800000000',
    courseCreditCapabilities: ['course_credit.teacher'],
    name: '本地测试老师',
});

const LOCAL_LESSON_QUANTITY = 10;

async function main() {
    const url = process.env.PB_URL || 'http://127.0.0.1:8090';
    assertLocalPocketBase(url);
    if (!envFlag('KANYUE_LOCAL_SEED')) {
        throw new Error('KANYUE_LOCAL_SEED=true is required for local course-booking seed');
    }

    const PocketBase = await import('pocketbase');
    const pb = new PocketBase.default(url);
    await pb.collection('_superusers').authWithPassword(requiredEnv('PB_EMAIL'), requiredEnv('PB_PASSWORD'));

    await ensureLocalTeacherCapabilitiesField(pb);
    const teacher = await ensureLocalTeacher(pb, requiredEnv('LOCAL_TEACHER_PASSWORD'));
    let course = await upsertByFilter(pb, 'course_specs', `code="${escapeFilter(LOCAL_COURSE.code)}"`, LOCAL_COURSE);
    const creditType = await upsertByFilter(pb, 'credit_types',
        `code="${escapeFilter(LOCAL_CREDIT_TYPE.code)}"`, {
            ...LOCAL_CREDIT_TYPE,
            courseSpecId: course.id,
        });
    course = await pb.collection('course_specs').update(course.id, {
        ...LOCAL_COURSE,
        defaultCreditTypeId: creditType.id,
    }, { requestKey: null });
    const policy = await upsertByFilter(pb, 'booking_policies',
        `code="${escapeFilter(LOCAL_POLICY.code)}"`, LOCAL_POLICY);

    await upsertByFilter(pb, 'teacher_credit_rules',
        `courseSpecId="${course.id}" && role="lead" && version=1`, {
            courseSpecId: course.id,
            role: 'lead',
            baseQuantity: 1,
            durationFactor: 0,
            participantFactor: 0,
            cancellationCompensation: null,
            validFrom: LOCAL_POLICY.effectiveFrom,
            version: 1,
            status: 'active',
        });

    const offering = await ensureOffering(pb, {
        teacherId: teacher.id,
        courseSpecId: course.id,
        creditTypeId: creditType.id,
        policyId: policy.id,
        location: '看乐艺术教室',
        availabilityMode: 'default',
        status: 'active',
    });

    const students = await pb.collection('students').getFullList({
        filter: 'blocked=false',
        sort: 'id',
        requestKey: null,
    });
    if (students.length === 0) {
        throw new Error('No unblocked local students found; run ops:seed:local first');
    }

    let createdGrants = 0;
    for (const student of students) {
        createdGrants += await ensureStudentGrant(pb, student.id, creditType.id);
    }

    console.log(
        `course booking seed ready: ${course.name}, teacher ${teacher.id}, offering ${offering.id}, `
        + `${students.length} eligible students (${createdGrants} new grants)`
    );
}

async function ensureLocalTeacherCapabilitiesField(pb) {
    const teachers = await pb.collections.getOne('teachers');
    const fields = Array.isArray(teachers.fields) ? teachers.fields : [];
    if (fields.some((field) => field.name === 'courseCreditCapabilities')) return;
    await pb.collections.update(teachers.id, {
        fields: [...fields, localTeacherCapabilitiesField()],
    });
}

function localTeacherCapabilitiesField() {
    return { name: 'courseCreditCapabilities', type: 'json', required: false };
}

async function ensureLocalTeacher(pb, password) {
    const result = await pb.collection('teachers').getList(1, 2, {
        filter: `cellphone="${LOCAL_TEACHER.cellphone}"`,
        requestKey: null,
    });
    if (result.totalItems > 1) {
        throw new Error(`Expected one local teacher for ${LOCAL_TEACHER.cellphone}, found ${result.totalItems}`);
    }
    if (result.items[0]) {
        const teacher = result.items[0];
        return pb.collection('teachers').update(teacher.id, {
            blocked: false,
            verified: true,
            ...localTeacherCredentials(password),
            courseCreditCapabilities: LOCAL_TEACHER.courseCreditCapabilities,
            nickName: teacher.nickName || teacher.nickname || LOCAL_TEACHER.name,
            nickname: teacher.nickname || teacher.nickName || LOCAL_TEACHER.name,
            realName: teacher.realName || teacher.realname || LOCAL_TEACHER.name,
            realname: teacher.realname || teacher.realName || LOCAL_TEACHER.name,
        }, { requestKey: null });
    }
    return pb.collection('teachers').create({
        ...LOCAL_TEACHER,
        emailVisibility: false,
        ...localTeacherCredentials(password),
        nickName: LOCAL_TEACHER.name,
        nickname: LOCAL_TEACHER.name,
        realName: LOCAL_TEACHER.name,
        realname: LOCAL_TEACHER.name,
        blocked: false,
        verified: true,
        idAdmin: false,
        isAdmin: false,
    }, { requestKey: null });
}

function localTeacherCredentials(password) {
    return { password, passwordConfirm: password };
}

async function ensureOffering(pb, payload) {
    const records = await pb.collection('teacher_course_offerings').getFullList({
        filter: `teacherId="${payload.teacherId}" && courseSpecId="${payload.courseSpecId}"`,
        sort: '-version',
        requestKey: null,
    });
    const active = records.find((record) => record.status === 'active');
    if (active) {
        return pb.collection('teacher_course_offerings').update(active.id, {
            ...payload,
            version: Number(active.version || 1),
        }, { requestKey: null });
    }
    const version = records.reduce((highest, record) => Math.max(highest, Number(record.version || 0)), 0) + 1;
    return pb.collection('teacher_course_offerings').create({ ...payload, version }, { requestKey: null });
}

async function ensureStudentGrant(pb, studentId, creditTypeId, now = new Date()) {
    const records = createGrantRecords({ studentId, creditTypeId, now });
    const operationCreated = await createIfMissing(pb, 'credit_operations', records.operation);
    const batchCreated = await createIfMissing(pb, 'credit_batches', records.batch);
    await createIfMissing(pb, 'credit_events', records.event);
    return Number(operationCreated || batchCreated);
}

function createGrantRecords({ studentId, creditTypeId, now = new Date() }) {
    const key = `${studentId}:${creditTypeId}`;
    const operationId = localRecordId('op', key);
    const batchId = localRecordId('bt', key);
    const eventId = localRecordId('ev', key);
    const businessTime = new Date(now).toISOString();
    const validFrom = new Date(new Date(now).getTime() - 86400000).toISOString();
    const expiresAt = new Date(new Date(now).getTime() + 365 * 86400000).toISOString();
    const snapshot = {
        availableQuantity: LOCAL_LESSON_QUANTITY,
        frozenQuantity: 0,
        consumedQuantity: 0,
        expiredQuantity: 0,
        reversedQuantity: 0,
    };
    return {
        operation: {
            id: operationId,
            operationNo: `local-booking-grant-${studentId}`,
            studentId,
            type: 'grant',
            status: 'committed',
            idempotencyKey: `local-booking-grant-${studentId}`,
            sourceType: 'local_seed',
            sourceId: LOCAL_COURSE.code,
            requestSnapshot: { creditTypeId, quantity: LOCAL_LESSON_QUANTITY },
            resultSnapshot: { batchId, quantity: LOCAL_LESSON_QUANTITY },
            actorId: 'local-seed',
            actorRole: 'service',
            reason: 'local_booking_seed',
            outcome: 'committed',
            beforeSummary: { availableQuantity: 0 },
            afterSummary: snapshot,
        },
        batch: {
            id: batchId,
            studentId,
            creditTypeId,
            sourceOperationId: operationId,
            originalQuantity: LOCAL_LESSON_QUANTITY,
            ...snapshot,
            status: 'active',
            validFrom,
            originalExpiresAt: expiresAt,
            effectiveExpiresAt: expiresAt,
            activationMode: 'GRANT_TIME',
            expiryPolicy: 'FIXED_DURATION',
            activatedAt: businessTime,
            validityDurationDays: 365,
            grantSnapshot: { source: 'local_seed', courseCode: LOCAL_COURSE.code },
            listUnitValue: 300,
            paidUnitCost: 0,
            currency: 'CNY',
            priority: 100,
            version: 1,
        },
        event: {
            id: eventId,
            operationId,
            batchId,
            studentId,
            creditTypeId,
            eventType: 'GRANT',
            quantityDelta: LOCAL_LESSON_QUANTITY,
            bucketFrom: '',
            bucketTo: 'availableQuantity',
            balanceSnapshot: snapshot,
            businessTime,
            actorId: 'local-seed',
            reason: 'local_booking_seed',
            metadata: { courseCode: LOCAL_COURSE.code },
        },
    };
}

async function upsertByFilter(pb, collectionName, filter, payload) {
    const collection = pb.collection(collectionName);
    const result = await collection.getList(1, 1, { filter, requestKey: null });
    if (result.items[0]) {
        return collection.update(result.items[0].id, payload, { requestKey: null });
    }
    return collection.create(payload, { requestKey: null });
}

async function createIfMissing(pb, collectionName, payload) {
    const collection = pb.collection(collectionName);
    try {
        await collection.getOne(payload.id, { requestKey: null });
        return false;
    } catch (error) {
        if (error?.status !== 404) throw error;
    }
    await collection.create(payload, { requestKey: null });
    return true;
}

function localRecordId(prefix, value) {
    if (!/^[a-z0-9]+$/.test(prefix) || prefix.length >= 15) {
        throw new Error('PocketBase record id prefix must contain lowercase letters or digits');
    }
    const hash = crypto.createHash('sha256').update(String(value)).digest('hex');
    return `${prefix}${hash}`.slice(0, 15);
}

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function assertLocalPocketBase(value) {
    const url = new URL(value);
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        throw new Error(`Refusing to seed non-local PocketBase host: ${url.hostname}`);
    }
}

function envFlag(name) {
    return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required for local course-booking seed`);
    return value;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    LOCAL_COURSE,
    LOCAL_CREDIT_TYPE,
    LOCAL_LESSON_QUANTITY,
    LOCAL_POLICY,
    LOCAL_TEACHER,
    assertLocalPocketBase,
    createGrantRecords,
    localTeacherCapabilitiesField,
    localTeacherCredentials,
    localRecordId,
    main,
};
