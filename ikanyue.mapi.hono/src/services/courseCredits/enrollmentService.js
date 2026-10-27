const { createHash } = require('node:crypto');

const {
    createOperationNo,
    createRecordId,
    invariant,
    scopedIdempotencyKey,
} = require('./domain');
const { buildGrantBatch } = require('./grantService');
const { operationAudit } = require('./operationAudit');
const { filterTime, fingerprintRequest, normalizeOperation } = require('./repositories/operationRepository');
const { create, escapeFilter } = require('./teachingCommand');

class AutomaticEnrollmentService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async enroll(input = {}) {
        validateEnrollmentInput(input);
        const scopedKey = scopedIdempotencyKey('automaticEnrollment', input.idempotencyKey);
        const request = enrollmentRequest(input);
        const requestHash = fingerprintRequest(request);
        const replay = await this.resolveReplay(scopedKey, requestHash);
        if (replay) return replay;

        const [student, packageRecord, price] = await Promise.all([
            this.repository.get('students', input.studentId),
            this.repository.get('packages', input.packageId),
            this.repository.get('price_versions', input.priceVersionId),
        ]);
        validateEnrollmentResources(packageRecord, price, input.packageId, this.clock());
        const lines = await this.repository.list('package_grant_lines', {
            filter: `packageId="${escapeFilter(input.packageId)}"`,
            sort: 'creditTypeId',
        });
        invariant(lines.length > 0, 'ENROLLMENT_PACKAGE_EMPTY', '课包没有配置课时');
        const creditTypes = new Map();
        for (const line of lines) {
            creditTypes.set(line.creditTypeId, await this.repository.get('credit_types', line.creditTypeId));
        }
        const classRecord = input.classId ? await this.validateClass(input, lines) : null;
        const at = new Date(this.clock()).toISOString();
        const operationId = this.idFactory();
        const orderId = this.idFactory();
        const membershipId = classRecord ? this.idFactory() : '';
        const futureLessons = classRecord ? await this.futurePublishedLessons(classRecord.id, at) : [];
        const grantSnapshot = buildGrantSnapshot(packageRecord, price, lines, creditTypes, input.paidAmount);
        const order = buildOrder({
            at, grantSnapshot, input, orderId, packageRecord, price, scopedKey, student,
        });
        const grants = grantSnapshot.lines.map((line) => buildGrantBatch({
            actorId: input.actorId,
            at,
            creditType: creditTypes.get(line.creditTypeId),
            idFactory: this.idFactory,
            line,
            operationId,
            order,
            snapshot: { defaults: {}, lines: grantSnapshot.lines },
        }));
        const result = enrollmentResult({
            classRecord, futureLessons, grants, membershipId, operationId, orderId, student,
        });
        const plan = enrollmentPlan({
            at, classRecord, grants, input, membershipId, operationId, order, requestHash, result, scopedKey,
            idFactory: this.idFactory,
        });

        try {
            await this.repository.send(plan);
        } catch (error) {
            const racedReplay = await this.resolveReplay(scopedKey, requestHash);
            if (racedReplay) return racedReplay;
            error.code = error.code || 'ENROLLMENT_TRANSACTION_FAILED';
            throw error;
        }
        return { ...result, replayed: false };
    }

    async validateClass(input, lines) {
        const classRecord = await this.repository.get('classes', input.classId);
        invariant(['draft', 'active'].includes(classRecord.status), 'ENROLLMENT_CLASS_CLOSED', '班级当前不能加入');
        invariant(lines.some((line) => line.creditTypeId === classRecord.defaultCreditTypeId),
            'ENROLLMENT_CLASS_COURSE_MISMATCH', '课包与班级课程不匹配');
        const existing = await this.repository.findFirst('class_students',
            `classId="${escapeFilter(input.classId)}" && studentId="${escapeFilter(input.studentId)}" && effectiveTo=""`);
        invariant(!existing, 'ENROLLMENT_CLASS_MEMBERSHIP_EXISTS', '学员已经在这个班级中');
        return classRecord;
    }

    futurePublishedLessons(classId, at) {
        return this.repository.list('session_classes', {
            filter: `classId="${escapeFilter(classId)}" && sessionId.startAt>="${escapeFilter(filterTime(at))}"`
                + ' && sessionId.status!="draft" && sessionId.status!="cancelled"',
            sort: 'sessionId.startAt',
            expand: 'sessionId',
        });
    }

    async resolveReplay(scopedKey, requestHash) {
        const existing = normalizeOperation(await this.repository.findFirst(
            'credit_operations', `idempotencyKey="${escapeFilter(scopedKey)}"`
        ));
        if (!existing) return null;
        invariant(existing.requestHash === requestHash,
            'IDEMPOTENCY_CONFLICT', '幂等键对应了不同的报课请求');
        return { ...existing.resultSnapshot, replayed: true };
    }
}

function enrollmentPlan(context) {
    const { at, classRecord, grants, idFactory, input, membershipId, operationId, order, requestHash, result, scopedKey } = context;
    const plan = [
        create('orders', order),
        create('payment_events', {
            id: idFactory(),
            orderId: order.id,
            providerEventId: input.paymentReference || `admin:${scopedKey}`,
            type: 'paid',
            amount: order.paidAmount,
            payloadHash: createHash('sha256').update(JSON.stringify({
                amount: order.paidAmount, channel: order.channel, reference: input.paymentReference || '',
            })).digest('hex'),
        }),
        create('credit_operations', {
            id: operationId,
            operationNo: createOperationNo('enroll', at, operationId),
            studentId: order.studentId,
            type: 'grant',
            status: 'committed',
            idempotencyKey: scopedKey,
            sourceType: 'enrollment',
            sourceId: order.id,
            requestSnapshot: { requestHash, classId: input.classId || '', packageId: input.packageId },
            resultSnapshot: result,
            actorId: input.actorId,
            actorRole: input.actorRole || 'admin',
            traceId: input.traceId || '',
            ...operationAudit({
                reason: input.reason || 'admin_enrollment',
                beforeSummary: { studentId: order.studentId },
                afterSummary: result,
            }),
        }),
        ...grants.flatMap(({ batch, event }) => [create('credit_batches', batch), create('credit_events', event)]),
    ];
    if (classRecord) {
        plan.push(create('class_students', {
            id: membershipId,
            classId: classRecord.id,
            studentId: order.studentId,
            status: 'active',
            effectiveFrom: at,
            effectiveTo: '',
            sourceOrderId: order.id,
        }));
    }
    plan.push(
        create('ops_audit_logs', {
            id: idFactory(), actorId: input.actorId, actorRole: input.actorRole || 'admin',
            action: 'course_operations.enrollment.create', resourceType: 'enrollment',
            resourceId: order.id, outcome: 'success', metadata: {
                classAssigned: Boolean(classRecord), futureLessonCount: result.sync.futureLessonCount,
            },
        }),
        create('outbox_events', {
            id: idFactory(), topic: 'course-enrollment.activated', aggregateType: 'order', aggregateId: order.id,
            payload: result, status: 'pending', attempts: 0,
        })
    );
    return plan;
}

function buildOrder({ at, grantSnapshot, input, orderId, packageRecord, price, scopedKey }) {
    const paidAmount = input.paidAmount === undefined ? Number(price.saleAmount) : Number(input.paidAmount);
    invariant(Number.isFinite(paidAmount) && paidAmount >= 0, 'ENROLLMENT_PAID_AMOUNT_INVALID', '实付金额无效');
    return {
        id: orderId,
        orderNo: `ENR-${new Date(at).getTime()}-${orderId}`,
        studentId: input.studentId,
        payerId: input.payerId || input.studentId,
        type: 'package_purchase',
        channel: input.channel || 'admin',
        status: 'granted',
        currency: price.currency,
        listAmount: Number(price.listAmount),
        paidAmount,
        priceVersionId: price.id,
        productSnapshot: {
            packageId: packageRecord.id,
            packageCode: packageRecord.code,
            packageName: packageRecord.name,
            priceVersion: price.version,
            classId: input.classId || '',
        },
        grantSnapshot,
        idempotencyKey: scopedKey,
        paidAt: at,
        cancelledAt: '',
        version: 1,
    };
}

function buildGrantSnapshot(packageRecord, price, lines, creditTypes, paidAmountInput) {
    const listAmount = Number(price.listAmount);
    const paidAmount = paidAmountInput === undefined ? Number(price.saleAmount) : Number(paidAmountInput);
    const weights = lines.map((line) => {
        const reference = Number(creditTypes.get(line.creditTypeId)?.referenceUnitValue) || 1;
        return reference * Number(line.quantity);
    });
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    return {
        activationMode: packageRecord.activationMode,
        activationDeadlineDays: Number(packageRecord.activationDeadlineDays) || 0,
        validityDurationDays: Number(packageRecord.validityDurationDays) || 0,
        expiryPolicy: packageRecord.expiryPolicy,
        lines: lines.map((line, index) => ({
            creditTypeId: line.creditTypeId,
            quantity: Number(line.quantity),
            activationMode: packageRecord.activationMode,
            activationDeadlineDays: Number(packageRecord.activationDeadlineDays) || 0,
            validityDurationDays: Number(packageRecord.validityDurationDays) || 0,
            expiryPolicy: packageRecord.expiryPolicy,
            listUnitValue: roundMoney(listAmount * weights[index] / totalWeight / Number(line.quantity)),
            paidUnitCost: roundMoney(paidAmount * weights[index] / totalWeight / Number(line.quantity)),
            currency: price.currency,
            priority: 0,
        })),
    };
}

function enrollmentResult({ classRecord, futureLessons, grants, membershipId, operationId, orderId, student }) {
    const futureLessonCount = futureLessons.length;
    return {
        operationId,
        orderId,
        studentId: student.id,
        classId: classRecord?.id || null,
        membershipId: membershipId || null,
        status: classRecord
            ? futureLessonCount > 0 ? 'synchronizing_future_lessons' : 'completed'
            : 'awaiting_class_assignment',
        grants: grants.map(({ batch }) => ({
            batchId: batch.id, creditTypeId: batch.creditTypeId, quantity: batch.originalQuantity,
        })),
        sync: {
            futureLessonCount,
            requiresConfirmation: futureLessonCount > 0,
            status: futureLessonCount > 0 ? 'preview_required' : 'not_required',
        },
    };
}

function validateEnrollmentInput(input) {
    for (const [field, code] of [
        ['studentId', 'STUDENT_ID_REQUIRED'], ['packageId', 'PACKAGE_ID_REQUIRED'],
        ['priceVersionId', 'PRICE_VERSION_ID_REQUIRED'], ['idempotencyKey', 'IDEMPOTENCY_KEY_REQUIRED'],
        ['actorId', 'ACTOR_ID_REQUIRED'],
    ]) {
        invariant(typeof input[field] === 'string' && input[field].trim(), code, `${field}不能为空`);
    }
    invariant(['admin', 'offline'].includes(input.channel || 'admin'),
        'ENROLLMENT_CHANNEL_INVALID', '报课渠道无效');
}

function validateEnrollmentResources(packageRecord, price, packageId, nowValue) {
    invariant(packageRecord?.status === 'active', 'ENROLLMENT_PACKAGE_INACTIVE', '课包当前不可用');
    invariant(price?.packageId === packageId && price.status === 'active',
        'ENROLLMENT_PRICE_INVALID', '价格版本与课包不匹配或未启用');
    const now = Number(nowValue);
    invariant(Date.parse(price.validFrom) <= now && (!price.validTo || Date.parse(price.validTo) > now),
        'ENROLLMENT_PRICE_EXPIRED', '价格版本不在有效期内');
}

function enrollmentRequest(input) {
    return {
        studentId: input.studentId,
        packageId: input.packageId,
        priceVersionId: input.priceVersionId,
        classId: input.classId || '',
        paidAmount: input.paidAmount,
        payerId: input.payerId || '',
        channel: input.channel || 'admin',
        paymentReference: input.paymentReference || '',
    };
}

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = {
    AutomaticEnrollmentService,
    buildGrantSnapshot,
    buildOrder,
    enrollmentPlan,
    enrollmentRequest,
    enrollmentResult,
    roundMoney,
    validateEnrollmentInput,
    validateEnrollmentResources,
};
