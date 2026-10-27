const {
    calculateTargetQuantity,
    createRecordId,
    invariant,
    scopedIdempotencyKey,
    validateConversionRule,
} = require('./domain');
const { activeConversionRulesAt } = require('./conversionRuleVersions');
const { buildFefoFilter, FEFO_SORT } = require('./repositories/batchRepository');
const { fingerprintRequest, normalizeOperation } = require('./repositories/operationRepository');
const { buildAuthorizedImplicitReservation, sourceQuantityForTarget } = require('./implicitReservation');
const { buildReservationMovements, planReservation } = require('./reservationPlanning');
const {
    buildEligibilityPlan,
    buildReservedPlan,
    reservationResult,
} = require('./reservationRequests');

class CourseCreditReservationService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async reserveSessionCredit(input = {}) {
        return this.reserveAttempt(input, 0);
    }

    async reserveAttempt(input, attempt) {
        invariant(typeof input.sessionStudentId === 'string' && input.sessionStudentId,
            'SESSION_STUDENT_ID_REQUIRED', 'sessionStudentId is required');
        const scopedKey = scopedIdempotencyKey('reserveSessionCredit', input.idempotencyKey);
        const requestHash = fingerprintRequest({
            authorizationId: input.authorizationId || '',
            sessionStudentId: input.sessionStudentId,
            targetTermEnd: input.targetTermEnd || '',
        });
        const replay = await this.resolveReplay(scopedKey, requestHash);
        if (replay) return replay;

        const sessionStudent = await this.repository.get('session_students', input.sessionStudentId);
        invariant(sessionStudent?.studentId && sessionStudent?.sessionId,
            'SESSION_STUDENT_INVALID', 'Session student is missing required relations');
        if (input.studentId !== undefined) {
            invariant(sessionStudent.studentId === input.studentId,
                'SESSION_STUDENT_FORBIDDEN', 'Cannot reserve course credits for another student');
        }
        const session = await this.repository.get('sessions', sessionStudent.sessionId);
        validateSession(session);
        const creditType = await this.repository.get('credit_types', session.requiredCreditTypeId);
        invariant(creditType?.kind === 'course' && creditType.consumable === true,
            'SESSION_CREDIT_TYPE_INVALID', 'Session must require an exact consumable course credit');

        const now = new Date(this.clock()).toISOString();
        const batches = await this.repository.list('credit_batches', {
            filter: buildFefoFilter({
                creditTypeId: session.requiredCreditTypeId,
                sessionStart: session.startAt,
                studentId: sessionStudent.studentId,
            }),
            sort: FEFO_SORT,
        });
        const planning = planReservation(batches, session.requiredQuantity, {
            creditType,
            now,
            requiredCreditTypeId: session.requiredCreditTypeId,
            sessionStart: session.startAt,
        });

        const operationId = this.idFactory();
        let outcome;
        let plan;
        if (planning.missingQuantity > 0 && input.authorizationId) {
            ({ outcome, plan } = await buildAuthorizedImplicitReservation(this, {
                creditType,
                input,
                now,
                operationId,
                planning,
                requestHash,
                scopedKey,
                session,
                sessionStudent,
            }));
        } else if (planning.missingQuantity > 0) {
            outcome = await this.buildEligibilityOutcome({
                now,
                operationId,
                planning,
                session,
                sessionStudent,
            });
            plan = buildEligibilityPlan({
                actor: input,
                idFactory: this.idFactory,
                now,
                operationId,
                outcome,
                requestHash,
                scopedKey,
                sessionStudent,
            });
        } else {
            const movements = buildReservationMovements(planning, this.idFactory);
            outcome = reservationResult(operationId, session, sessionStudent, movements);
            plan = buildReservedPlan({
                actor: input,
                idFactory: this.idFactory,
                movements,
                now,
                operationId,
                outcome,
                requestHash,
                scopedKey,
                session,
                sessionStudent,
            });
        }

        try {
            await this.repository.send(plan);
        } catch (error) {
            const racedReplay = await this.resolveReplay(scopedKey, requestHash);
            if (racedReplay) return racedReplay;
            if (attempt === 0 && isVersionConflict(error)) return this.reserveAttempt(input, 1);
            error.code = error.code || 'COURSE_CREDIT_BATCH_FAILED';
            throw error;
        }
        return { ...outcome, replayed: false };
    }

    async buildEligibilityOutcome({ now, operationId, planning, session, sessionStudent }) {
        const conversion = await findConversionAvailability(this.repository, {
            missingQuantity: planning.missingQuantity,
            now,
            studentId: sessionStudent.studentId,
            targetCreditTypeId: session.requiredCreditTypeId,
        });
        return {
            allocations: [],
            conversion,
            creditStatus: conversion ? 'conversion_required' : 'credit_insufficient',
            missingQuantity: planning.missingQuantity,
            operationId,
            sessionId: session.id,
            sessionStudentId: sessionStudent.id,
        };
    }

    async resolveReplay(scopedKey, requestHash) {
        const existing = normalizeOperation(await this.repository.findFirst(
            'credit_operations',
            `idempotencyKey="${escapeFilter(scopedKey)}"`
        ));
        if (!existing) return null;
        invariant(existing.requestHash === requestHash,
            'IDEMPOTENCY_CONFLICT', 'Idempotency key conflicts with another request');
        return { ...existing.resultSnapshot, replayed: true };
    }
}

async function findConversionAvailability(repository, query) {
    const at = escapeFilter(new Date(query.now).toISOString());
    const rules = await repository.list('conversion_rules', {
        filter: `targetCreditTypeId="${escapeFilter(query.targetCreditTypeId)}"`,
        sort: '-version',
    });
    for (const rule of activeConversionRulesAt(rules, at)) {
        validateConversionRule(rule, query.now);
        const sourceQuantity = sourceQuantityForTarget(rule, query.missingQuantity);
        if (rule.maxSourceQuantity && sourceQuantity > rule.maxSourceQuantity) continue;
        const batches = await repository.list('credit_batches', {
            filter: buildFefoFilter({
                creditTypeId: rule.sourceCreditTypeId,
                sessionStart: query.now,
                studentId: query.studentId,
            }),
            sort: FEFO_SORT,
        });
        const available = batches.reduce((sum, batch) => sum + Number(batch.availableQuantity || 0), 0);
        if (available >= sourceQuantity) {
            return {
                ruleId: rule.id,
                ruleVersion: rule.version,
                sourceCreditTypeId: rule.sourceCreditTypeId,
                sourceQuantity,
                targetQuantity: calculateTargetQuantity(rule, sourceQuantity),
            };
        }
    }
    return null;
}

function validateSession(session) {
    invariant(session && ['scheduled', 'enrollment_closed'].includes(session.status),
        'SESSION_NOT_RESERVABLE', 'Session is not open for credit reservation');
    invariant(Number.isInteger(session.requiredQuantity) && session.requiredQuantity > 0,
        'SESSION_CREDIT_QUANTITY_INVALID', 'Session required quantity must be a positive integer');
    invariant(Number.isFinite(Date.parse(session.startAt)),
        'SESSION_START_INVALID', 'Session start time is invalid');
}

function isVersionConflict(error) {
    return error?.status === 400 || error?.status === 409 || error?.code === 'VERSION_CONFLICT';
}

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

module.exports = {
    CourseCreditReservationService,
    buildEligibilityPlan,
    buildReservedPlan,
    findConversionAvailability,
    isVersionConflict,
    sourceQuantityForTarget,
    validateSession,
};
