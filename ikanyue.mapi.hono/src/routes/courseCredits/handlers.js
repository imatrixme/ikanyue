const { randomUUID } = require('node:crypto');

const { CourseCreditError, invariant } = require('../../services/courseCredits/domain');
const { createDefaultCourseCreditServices } = require('../../services/courseCredits');
const { createOpsServices } = require('../../services/ops');
const { defaultCourseCreditMetrics } = require('../../services/courseCredits/metricsService');
const {
    COURSE_CREDIT_CAPABILITIES: CAPABILITY,
    requireAnyCourseCreditCapability,
    requireCourseCreditCapability,
} = require('../../services/courseCredits/authorization');
const { createCourseCreditHandlerExtensions } = require('./handlerExtensions');

const TRACE_ID = Symbol('courseCreditTraceId');
const AUTHORIZATION_AUDIT = Symbol('courseCreditAuthorizationAudit');

const AUTHORIZATION_ERRORS = new Set([
    'COURSE_CREDIT_ADMIN_REQUIRED',
    'COURSE_CREDIT_CAPABILITY_REQUIRED',
    'COURSE_CREDIT_STUDENT_REQUIRED',
    'STUDENT_LEARNING_STUDENT_REQUIRED',
    'SESSION_TEACHER_FORBIDDEN',
    'SESSION_TEACHER_TARGET_FORBIDDEN',
    'SESSION_STUDENT_FORBIDDEN',
    'BOOKING_TEACHER_REQUIRED',
    'APPOINTMENT_TEACHER_FORBIDDEN',
    'APPOINTMENT_STUDENT_FORBIDDEN',
    'APPOINTMENT_CANCEL_FORBIDDEN',
    'APPOINTMENT_RESCHEDULE_FORBIDDEN',
    'BOOKING_OFFERING_FORBIDDEN',
    'BOOKING_OVERRIDE_FORBIDDEN',
]);

function createCourseCreditHandlers(
    loadServices = createDefaultCourseCreditServices,
    metrics = defaultCourseCreditMetrics,
    authorizationAudit = createOpsServices().auditService
) {
    return withAuthorizationAudit({
        ...createCourseCreditHandlerExtensions({
            capability: CAPABILITY,
            commandMetadata,
            loadServices,
            metrics,
            queryParams,
            readJsonBody,
            readOptionalJsonBody,
            requireAnyCapability: requireAnyCourseCreditCapability,
            requireCapability,
            requireStudent,
            safeCommand,
            safeQuery,
        }),
        async grantOrderCredits(c) {
            return safeCommand(c, 'grantOrderCredits', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.FINANCE);
                const services = await loadServices();
                return services.grantService.grantOrderCredits({
                    ...commandMetadata(c, user),
                    orderId: c.req.param('orderId'),
                });
            }, metrics);
        },

        async setStudentMembership(c) {
            return safeCommand(c, 'setStudentMembership', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.ACADEMIC);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.classMembershipService.setStudentMembership({
                    ...commandMetadata(c, user),
                    classId: c.req.param('classId'),
                    studentId: c.req.param('studentId'),
                    status: body.status,
                    effectiveFrom: body.effectiveFrom,
                    effectiveTo: body.effectiveTo,
                    sourceOrderId: body.sourceOrderId,
                });
            }, metrics);
        },

        async transferStudent(c) {
            return safeCommand(c, 'transferStudent', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.ACADEMIC);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.classMembershipService.transferStudent({
                    ...commandMetadata(c, user),
                    fromClassId: c.req.param('classId'),
                    toClassId: body.toClassId,
                    studentId: c.req.param('studentId'),
                    effectiveAt: body.effectiveAt,
                    sourceOrderId: body.sourceOrderId,
                });
            }, metrics);
        },

        async setTeacherAssignment(c) {
            return safeCommand(c, 'setTeacherAssignment', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.ACADEMIC);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.classMembershipService.setTeacherAssignment({
                    ...commandMetadata(c, user),
                    classId: c.req.param('classId'),
                    teacherId: c.req.param('teacherId'),
                    role: body.role,
                    status: body.status,
                    effectiveFrom: body.effectiveFrom,
                    effectiveTo: body.effectiveTo,
                });
            }, metrics);
        },

        async publishSession(c) {
            return safeCommand(c, 'publishSession', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.ACADEMIC);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.sessionPublicationService.publishSession({
                    ...commandMetadata(c, user),
                    sessionId: c.req.param('sessionId'),
                    classIds: body.classIds,
                    teacherOverrides: body.teacherOverrides,
                });
            }, metrics);
        },

        async reserveSessionCredit(c) {
            return safeCommand(c, 'reserveSessionCredit', async () => {
                const user = requireStudent(c.get('user'));
                const body = await readOptionalJsonBody(c);
                const services = await loadServices();
                return services.reservationService.reserveSessionCredit({
                    actorId: user.id,
                    actorRole: 'student',
                    authorizationId: body.authorizationId,
                    idempotencyKey: c.req.header('idempotency-key') || '',
                    sessionStudentId: c.req.param('sessionStudentId'),
                    studentId: user.id,
                    targetTermEnd: body.targetTermEnd,
                    traceId: resolveTraceId(c),
                });
            }, metrics);
        },

        async confirmTeacherCredit(c) {
            return safeCommand(c, 'confirmTeacherCredit', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.FINANCE);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.teacherCreditService.confirmTeacherCredit({
                    ...commandMetadata(c, user),
                    teacherCreditEventId: c.req.param('teacherCreditEventId'),
                    reason: body.reason,
                });
            }, metrics);
        },

        async listOutboxDeadLetters(c) {
            return safeQuery(c, async () => {
                requireCapability(c.get('user'), CAPABILITY.AUDIT);
                const services = await loadServices();
                return services.outboxService.listDeadLetters({
                    page: c.req.query('page'),
                    perPage: c.req.query('perPage'),
                });
            });
        },

        async getMetrics(c) {
            return safeQuery(c, async () => {
                requireCapability(c.get('user'), CAPABILITY.AUDIT);
                const services = await loadServices();
                return services.metricsService.snapshot();
            });
        },

        async extendBatchExpiry(c) {
            return safeCommand(c, 'extendBatchExpiry', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.SETTLEMENT);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.batchLifecycleService.extendBatchExpiry({
                    ...commandMetadata(c, user),
                    approvedBy: user.id,
                    batchId: c.req.param('batchId'),
                    newExpiresAt: body.newExpiresAt,
                    reason: body.reason,
                });
            }, metrics);
        },

        async restoreExpiredQuantity(c) {
            return safeCommand(c, 'restoreExpiredQuantity', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.SETTLEMENT);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.batchLifecycleService.restoreExpiredQuantity({
                    ...commandMetadata(c, user),
                    approvedBy: user.id,
                    batchId: c.req.param('batchId'),
                    quantity: body.quantity,
                    reason: body.reason,
                    validityDurationDays: body.validityDurationDays,
                });
            }, metrics);
        },

        async rescheduleSession(c) {
            return safeCommand(c, 'rescheduleSession', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.ACADEMIC);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.sessionRescheduleService.rescheduleSession({
                    ...commandMetadata(c, user),
                    newEndAt: body.newEndAt,
                    newStartAt: body.newStartAt,
                    reason: body.reason,
                    sessionId: c.req.param('sessionId'),
                });
            }, metrics);
        },

        async settleSession(c) {
            return safeCommand(c, 'settleSession', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.SETTLEMENT);
                const body = await readOptionalJsonBody(c);
                const services = await loadServices();
                return services.sessionSettlementService.settleSession({
                    ...commandMetadata(c, user),
                    reason: body.reason,
                    sessionId: c.req.param('sessionId'),
                });
            }, metrics);
        },

        async reverseSessionSettlement(c) {
            return safeCommand(c, 'reverseSessionSettlement', async () => {
                const user = requireCapability(c.get('user'), CAPABILITY.SETTLEMENT);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.sessionSettlementReversalService.reverseSessionSettlement({
                    ...commandMetadata(c, user),
                    reason: body.reason,
                    sessionId: c.req.param('sessionId'),
                });
            }, metrics);
        },

        async runReconciliation(c) {
            return safeCommand(c, 'runReconciliation', async () => {
                requireCapability(c.get('user'), CAPABILITY.AUDIT);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.reconciliationService.run({
                    scope: body.scope,
                    since: body.since,
                });
            }, metrics);
        },

        async getStudentSummary(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                const services = await loadServices();
                return services.queryService.summary(user.id);
            });
        },

        async listStudentBatches(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                const services = await loadServices();
                return services.queryService.listBatches(user.id, queryParams(c, ['page', 'perPage', 'status', 'creditTypeId']));
            });
        },

        async getStudentBatch(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                const services = await loadServices();
                return services.queryService.getBatch(user.id, c.req.param('batchId'));
            });
        },

        async listStudentEvents(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                const services = await loadServices();
                return services.queryService.listEvents(user.id, queryParams(c, ['page', 'perPage', 'eventType']));
            });
        },

        async listStudentConversionRules(c) {
            return safeQuery(c, async () => {
                requireStudent(c.get('user'));
                const services = await loadServices();
                return services.queryService.listConversionRules();
            });
        },

        async previewStudentConversion(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.conversionService.previewConversion(studentConversionInput(c, user, body));
            });
        },

        async convertStudentCredits(c) {
            return safeCommand(c, 'convertCredits', async () => {
                const user = requireStudent(c.get('user'));
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.conversionService.convertCredits({
                    ...studentConversionInput(c, user, body),
                    idempotencyKey: c.req.header('idempotency-key') || '',
                });
            }, metrics);
        },

        async listStudentSessions(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                const services = await loadServices();
                return services.queryService.listSessions(user.id, queryParams(c, ['page', 'perPage']));
            });
        },
    }, authorizationAudit);
}

function studentConversionInput(c, user, body) {
    return {
        actorId: user.id,
        actorRole: 'student',
        authorizationId: body.authorizationId,
        previewAt: body.previewAt,
        previewHash: body.previewHash,
        ruleId: body.ruleId,
        sourceQuantity: body.sourceQuantity,
        studentId: user.id,
        targetTermEnd: body.targetTermEnd,
        traceId: resolveTraceId(c),
    };
}

function queryParams(c, names) {
    return Object.fromEntries(names
        .map((name) => [name, c.req.query(name)])
        .filter((entry) => entry[1] !== undefined));
}

function commandMetadata(c, user) {
    return {
        actorId: user.id,
        actorRole: user.isAdmin ? 'admin' : user.role,
        idempotencyKey: c.req.header('idempotency-key') || '',
        traceId: resolveTraceId(c),
    };
}

async function readJsonBody(c) {
    try {
        const body = await c.req.json();
        invariant(body && typeof body === 'object' && !Array.isArray(body),
            'INVALID_JSON_BODY', '请求体必须是 JSON 对象');
        return body;
    } catch (error) {
        if (error instanceof CourseCreditError) throw error;
        throw new CourseCreditError('INVALID_JSON_BODY', '请求体必须是有效的 JSON 对象');
    }
}

async function readOptionalJsonBody(c) {
    const contentType = c.req.header('content-type') || '';
    return contentType.includes('application/json') ? readJsonBody(c) : {};
}

async function safeCommand(c, commandName, command, metrics = defaultCourseCreditMetrics) {
    try {
        const result = await metrics.measureCommand(commandName, command);
        return c.data(withCommandTrace(result, resolveTraceId(c)));
    } catch (error) {
        await recordAuthorizationDenial(c, error);
        return sendCommandError(c, error);
    }
}

async function safeQuery(c, query) {
    try {
        return c.data(await query());
    } catch (error) {
        await recordAuthorizationDenial(c, error);
        return sendCommandError(c, error);
    }
}

function withAuthorizationAudit(handlers, auditService) {
    return Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, (c) => {
        c[AUTHORIZATION_AUDIT] = auditService;
        return handler(c);
    }]));
}

async function recordAuthorizationDenial(c, error) {
    const audit = c[AUTHORIZATION_AUDIT];
    if (!AUTHORIZATION_ERRORS.has(error?.code) || typeof audit?.denied !== 'function') return;
    try {
        await audit.denied(
            c.get('user'),
            `course_credit.${c.req.method.toLowerCase()}`,
            'course_credit_route',
            c.req.path,
            {
                capability: error?.details?.capability || '',
                errorCode: error.code,
                traceId: resolveTraceId(c),
            }
        );
    } catch {
        // Authorization remains denied even when the secondary audit sink is unavailable.
    }
}

function requireCapability(user, capability) {
    return requireCourseCreditCapability(user, capability);
}

function requireStudent(user = {}) {
    invariant(user.id && user.role === 'student',
        'COURSE_CREDIT_STUDENT_REQUIRED', '仅学员可预约课程点');
    return user;
}

function sendCommandError(c, error) {
    const businessCode = typeof error?.code === 'string'
        ? error.code
        : 'COURSE_CREDIT_INTERNAL_ERROR';
    return c.json({
        code: responseStatus(error),
        message: error?.message || '服务器内部错误',
        data: null,
        errorCode: businessCode,
        details: error?.details || {},
        operationId: error?.details?.operationId || null,
        traceId: resolveTraceId(c),
    }, 200);
}

function resolveTraceId(c) {
    if (c[TRACE_ID]) return c[TRACE_ID];
    const requested = c.req.header('x-trace-id');
    c[TRACE_ID] = typeof requested === 'string' && requested.trim()
        ? requested.trim().slice(0, 160)
        : randomUUID();
    return c[TRACE_ID];
}

function withCommandTrace(result, traceId) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return { result, operationId: null, traceId };
    }
    return { ...result, operationId: result.operationId || null, traceId };
}

function responseStatus(error) {
    if (AUTHORIZATION_ERRORS.has(error?.code)) return 403;
    if (error instanceof CourseCreditError) return 400;
    if (Number.isInteger(error?.status) && error.status >= 400) return error.status;
    return 500;
}

module.exports = {
    commandMetadata,
    createCourseCreditHandlers,
    readJsonBody,
    readOptionalJsonBody,
    recordAuthorizationDenial,
    requireCapability,
    requireStudent,
    responseStatus,
    resolveTraceId,
    safeCommand,
    safeQuery,
    sendCommandError,
    studentConversionInput,
    queryParams,
    withAuthorizationAudit,
    withCommandTrace,
};
