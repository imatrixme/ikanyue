const {
    calculateTargetQuantity,
    conversionTermsFingerprint,
    createOperationNo,
    createRecordId,
    deriveBatchStatus,
    invariant,
    materialConversionTerms,
    moveQuantity,
    scopedIdempotencyKey,
    validateConversionAuthorization,
    validateConversionRule,
    validateCreditType,
} = require('./domain');
const { balanceSnapshot } = require('./grantService');
const {
    buildConversionTargetPreview,
    planConversionSources,
} = require('./conversionPlanning');
const { fingerprintRequest, normalizeOperation } = require('./repositories/operationRepository');
const { operationAudit } = require('./operationAudit');

class CourseCreditConversionService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async previewConversion(input = {}) {
        const prepared = await this.prepare(input);
        return prepared.preview;
    }

    async convertCredits(input = {}) {
        return this.convertAttempt(input, 0);
    }

    async convertAttempt(input, attempt) {
        validateConversionInput(input);
        const scopedKey = scopedIdempotencyKey('convertCredits', input.idempotencyKey);
        const requestHash = fingerprintRequest({
            authorizationId: input.authorizationId || '',
            previewHash: input.previewHash || '',
            previewAt: input.previewAt || '',
            ruleId: input.ruleId,
            sourceQuantity: input.sourceQuantity,
            studentId: input.studentId,
            targetTermEnd: input.targetTermEnd || '',
        });
        const replay = await this.resolveOperationReplay(scopedKey, requestHash);
        if (replay) return replay;

        const prepared = await this.prepare(input);
        await this.validateConsent(input, prepared);
        const operationId = this.idFactory();
        const targets = prepared.targets.map((target) => ({
            ...target,
            targetBatchId: this.idFactory(),
        }));
        const result = {
            operationId,
            previewHash: prepared.preview.previewHash,
            ruleId: prepared.rule.id,
            sourceQuantity: input.sourceQuantity,
            studentId: input.studentId,
            targetQuantity: calculateTargetQuantity(prepared.rule, input.sourceQuantity),
            targets: targets.map((target) => ({
                effectiveExpiresAt: target.effectiveExpiresAt,
                sourceBatchId: target.sourceBatchId,
                sourceQuantity: target.sourceQuantity,
                targetBatchId: target.targetBatchId,
                targetQuantity: target.targetQuantity,
            })),
        };
        const plan = [operation(this, input, prepared.rule, scopedKey, requestHash, result, operationId)];
        for (const target of targets) {
            const source = prepared.sourceBatches.get(target.sourceBatchId);
            const nextSource = {
                ...moveQuantity(source, 'availableQuantity', 'consumedQuantity', target.sourceQuantity),
                version: source.version + 1,
            };
            nextSource.status = deriveBatchStatus(nextSource);
            const targetBatch = buildTargetBatch({
                convertedAt: prepared.now,
                input,
                operationId,
                rule: prepared.rule,
                target,
            });
            plan.push(
                versionClaim(this, source.id, source.version, operationId),
                update('credit_batches', source.id, sourceUpdate(nextSource)),
                create('credit_batches', targetBatch),
                create('credit_events', conversionEvent(
                    this, input, operationId, nextSource, 'CONVERT_OUT', -target.sourceQuantity,
                    'availableQuantity', 'consumedQuantity', target.targetBatchId
                )),
                create('credit_events', conversionEvent(
                    this, input, operationId, targetBatch, 'CONVERT_IN', target.targetQuantity,
                    '', 'availableQuantity', source.id
                )),
                create('conversion_allocations', {
                    id: this.idFactory(),
                    operationId,
                    sourceBatchId: source.id,
                    targetBatchId: target.targetBatchId,
                    sourceQuantity: target.sourceQuantity,
                    targetQuantity: target.targetQuantity,
                    expiryPolicySnapshot: {
                        activationDeadline: target.activationDeadline,
                        activationMode: target.activationMode,
                        effectiveExpiresAt: target.effectiveExpiresAt,
                        expiryPolicy: prepared.rule.expiryPolicy,
                        ruleId: prepared.rule.id,
                        ruleVersion: prepared.rule.version,
                    },
                })
            );
        }
        plan.push(outbox(this, result));
        try {
            await this.repository.send(plan);
        } catch (error) {
            const racedReplay = await this.resolveOperationReplay(scopedKey, requestHash);
            if (racedReplay) return racedReplay;
            if (attempt === 0 && isVersionConflict(error)) return this.convertAttempt(input, 1);
            error.code = error.code || 'COURSE_CREDIT_BATCH_FAILED';
            throw error;
        }
        return { ...result, replayed: false };
    }

    async authorizeAutomaticConversion(input = {}) {
        invariant(typeof input.studentId === 'string' && input.studentId,
            'STUDENT_ID_REQUIRED', 'studentId is required');
        invariant(typeof input.ruleId === 'string' && input.ruleId,
            'CONVERSION_RULE_ID_REQUIRED', 'ruleId is required');
        const explicitPreview = input.consentSource === 'explicit_preview';
        const prepared = explicitPreview ? await this.prepare(input) : null;
        if (prepared) {
            invariant(input.previewHash === prepared.preview.previewHash,
                'CONVERSION_PREVIEW_STALE', 'Authorization preview is missing or no longer matches current terms');
        }
        const idempotencyKey = scopedIdempotencyKey('authorizeAutomaticConversion', input.idempotencyKey);
        const existing = await this.repository.findFirst(
            'conversion_authorizations', `idempotencyKey="${escapeFilter(idempotencyKey)}"`
        );
        const rule = prepared?.rule || validateConversionRule(
            await this.repository.get('conversion_rules', input.ruleId), new Date(this.clock()).toISOString()
        );
        const validFrom = new Date(this.clock()).toISOString();
        const validTo = optionalFutureDate(input.validTo, this.clock());
        const termsFingerprint = conversionTermsFingerprint(rule);
        const fingerprint = fingerprintRequest({
            consentSource: input.consentSource || 'standing_authorization',
            previewHash: prepared?.preview.previewHash || '',
            ruleId: rule.id, studentId: input.studentId, termsFingerprint, validTo,
        });
        if (existing) {
            invariant(existing.requestFingerprint === fingerprint,
                'IDEMPOTENCY_CONFLICT', 'Authorization idempotency key conflicts with another request');
            return {
                authorizationId: existing.id,
                previewHash: prepared?.preview.previewHash || '',
                replayed: true,
                termsFingerprint,
                validTo,
            };
        }
        const authorizationId = this.idFactory();
        await this.repository.send([create('conversion_authorizations', {
            id: authorizationId,
            studentId: input.studentId,
            ruleId: rule.id,
            sourceCreditTypeId: rule.sourceCreditTypeId,
            targetCreditTypeId: rule.targetCreditTypeId,
            termsFingerprint,
            requestFingerprint: fingerprint,
            status: 'active',
            consentSource: input.consentSource || 'standing_authorization',
            idempotencyKey,
            validFrom,
            validTo,
        })]);
        return {
            authorizationId,
            previewHash: prepared?.preview.previewHash || '',
            replayed: false,
            termsFingerprint,
            validTo,
        };
    }

    async prepare(input) {
        validateConversionInput(input);
        const now = resolvePreparationTime(input, this.clock);
        const rule = validateConversionRule(await this.repository.get('conversion_rules', input.ruleId), now);
        calculateTargetQuantity(rule, input.sourceQuantity);
        const [sourceType, targetType] = await Promise.all([
            this.repository.get('credit_types', rule.sourceCreditTypeId),
            this.repository.get('credit_types', rule.targetCreditTypeId),
        ]);
        invariant(sourceType && targetType,
            'CONVERSION_TYPE_REQUIRED', 'Conversion rule references a missing credit type');
        validateCreditType(sourceType);
        validateCreditType(targetType);
        invariant(targetType.kind === 'course' && targetType.consumable === true,
            'CONVERSION_TARGET_NOT_CONSUMABLE', 'Conversion target must be an exact consumable course credit');
        const records = await this.repository.list('credit_batches', {
            filter: conversionBatchFilter(input.studentId, rule.sourceCreditTypeId),
            sort: 'effectiveExpiresAt,priority,created,id',
        });
        const planning = planConversionSources(records, input.sourceQuantity, rule, { now });
        invariant(planning.missingQuantity === 0,
            'CREDIT_INSUFFICIENT', 'Eligible source batches cannot cover the requested conversion', {
                missingQuantity: planning.missingQuantity,
                rejectedBatches: planning.rejectedBatches,
            });
        const targets = planning.allocations.map((allocation) => (
            buildConversionTargetPreview(rule, allocation, now, { targetTermEnd: input.targetTermEnd })
        ));
        const core = {
            authorizationRequired: true,
            previewAt: now,
            reversible: Boolean(rule.reversible),
            rule: { id: rule.id, version: rule.version, ...materialConversionTerms(rule) },
            sourceQuantity: input.sourceQuantity,
            studentId: input.studentId,
            targetQuantity: calculateTargetQuantity(rule, input.sourceQuantity),
            targets,
        };
        return {
            preview: { ...core, previewHash: fingerprintRequest(core) },
            now,
            rule,
            sourceBatches: new Map(planning.allocations.map((item) => [item.batch.id, item.batch])),
            targets,
        };
    }

    async validateConsent(input, prepared) {
        if (input.authorizationId) {
            const authorization = await this.repository.get('conversion_authorizations', input.authorizationId);
            validateConversionAuthorization(authorization, prepared.rule, {
                now: new Date(this.clock()).toISOString(), studentId: input.studentId,
            });
            return;
        }
        invariant(input.previewHash === prepared.preview.previewHash,
            'CONVERSION_PREVIEW_STALE', 'Conversion preview is missing or no longer matches current terms');
    }

    async resolveOperationReplay(scopedKey, requestHash) {
        const existing = normalizeOperation(await this.repository.findFirst(
            'credit_operations', `idempotencyKey="${escapeFilter(scopedKey)}"`
        ));
        if (!existing) return null;
        invariant(existing.requestHash === requestHash,
            'IDEMPOTENCY_CONFLICT', 'Idempotency key conflicts with another request');
        return { ...existing.resultSnapshot, replayed: true };
    }
}

function buildTargetBatch({ convertedAt, input, operationId, rule, target }) {
    return {
        id: target.targetBatchId,
        studentId: input.studentId,
        creditTypeId: rule.targetCreditTypeId,
        sourceOperationId: operationId,
        compensationSourceBatchId: '',
        originalQuantity: target.targetQuantity,
        availableQuantity: target.targetQuantity,
        frozenQuantity: 0,
        consumedQuantity: 0,
        expiredQuantity: 0,
        reversedQuantity: 0,
        status: target.status,
        validFrom: convertedAt,
        originalExpiresAt: target.effectiveExpiresAt || '',
        effectiveExpiresAt: target.effectiveExpiresAt || '',
        activationMode: target.activationMode,
        expiryPolicy: target.expiryPolicy,
        activationDeadline: target.activationDeadline || '',
        activatedAt: target.activatedAt || '',
        validityDurationDays: target.validityDurationDays ?? 0,
        grantSnapshot: { conversionRuleId: rule.id, conversionRuleVersion: rule.version },
        listUnitValue: target.listUnitValue,
        paidUnitCost: target.paidUnitCost,
        currency: target.currency,
        priority: target.priority,
        version: 1,
    };
}

function validateConversionInput(input) {
    invariant(typeof input.studentId === 'string' && input.studentId,
        'STUDENT_ID_REQUIRED', 'studentId is required');
    invariant(typeof input.ruleId === 'string' && input.ruleId,
        'CONVERSION_RULE_ID_REQUIRED', 'ruleId is required');
    invariant(Number.isInteger(input.sourceQuantity) && input.sourceQuantity > 0,
        'INVALID_CREDIT_QUANTITY', 'sourceQuantity must be a positive integer');
}

function conversionBatchFilter(studentId, creditTypeId) {
    return `studentId="${escapeFilter(studentId)}" && creditTypeId="${escapeFilter(creditTypeId)}"`
        + ' && availableQuantity>0 && (status="active" || status="unactivated")';
}

function sourceUpdate(batch) {
    return {
        availableQuantity: batch.availableQuantity,
        consumedQuantity: batch.consumedQuantity,
        status: batch.status,
        version: batch.version,
    };
}

function operation(service, input, rule, scopedKey, requestHash, result, operationId) {
    return create('credit_operations', {
        id: operationId,
        operationNo: createOperationNo('convert', new Date(service.clock()).toISOString(), operationId),
        studentId: input.studentId,
        type: 'convert',
        status: 'committed',
        idempotencyKey: scopedKey,
        sourceType: 'conversion_rule',
        sourceId: rule.id,
        ruleVersionId: rule.id,
        requestSnapshot: { requestHash, previewHash: result.previewHash },
        resultSnapshot: result,
        actorId: input.actorId || input.studentId,
        actorRole: input.actorRole || 'student',
        traceId: input.traceId || '',
        ...operationAudit({
            reason: 'credit_conversion',
            beforeSummary: {
                ruleId: input.ruleId,
                sourceQuantity: input.sourceQuantity,
                studentId: input.studentId,
            },
            afterSummary: result,
        }),
    });
}

function conversionEvent(service, input, operationId, batch, eventType, quantityDelta, bucketFrom, bucketTo, linkedBatchId) {
    return {
        id: service.idFactory(), operationId, batchId: batch.id, studentId: input.studentId,
        creditTypeId: batch.creditTypeId, eventType, quantityDelta, bucketFrom, bucketTo,
        balanceSnapshot: balanceSnapshot(batch), businessTime: new Date(service.clock()).toISOString(),
        actorId: input.actorId || input.studentId, reason: 'credit_conversion',
        metadata: { linkedBatchId, ruleId: input.ruleId },
    };
}

function versionClaim(service, batchId, version, operationId) {
    return create('credit_version_claims', {
        id: service.idFactory(), entityType: 'credit_batch', entityId: batchId,
        expectedVersion: version, operationId,
    });
}

function outbox(service, result) {
    return create('outbox_events', {
        id: service.idFactory(), topic: 'course-credit.converted', aggregateType: 'credit_operation',
        aggregateId: result.operationId, payload: result, status: 'pending', attempts: 0,
    });
}

function optionalFutureDate(value, now) {
    if (!value) return '';
    const timestamp = Date.parse(value);
    invariant(Number.isFinite(timestamp) && timestamp > now,
        'INVALID_AUTHORIZATION_EXPIRY', 'Authorization validTo must be a future date');
    return new Date(timestamp).toISOString();
}

function resolvePreparationTime(input, clock) {
    const current = clock();
    if (!input.previewAt) return new Date(current).toISOString();
    const previewAt = Date.parse(input.previewAt);
    invariant(Number.isFinite(previewAt),
        'CONVERSION_PREVIEW_TIMESTAMP_INVALID', 'previewAt must be a valid date');
    invariant(previewAt <= current + 1000 && current - previewAt <= 5 * 60 * 1000,
        'CONVERSION_PREVIEW_EXPIRED', 'Conversion preview is outside the five-minute validity window');
    return new Date(previewAt).toISOString();
}

function isVersionConflict(error) {
    return error?.status === 400 || error?.status === 409 || error?.code === 'VERSION_CONFLICT';
}

function create(collection, data) {
    return { action: 'create', collection, data };
}

function update(collection, id, data) {
    return { action: 'update', collection, id, data };
}

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

module.exports = {
    CourseCreditConversionService,
    buildTargetBatch,
    conversionBatchFilter,
    isVersionConflict,
    optionalFutureDate,
    resolvePreparationTime,
    sourceUpdate,
    validateConversionInput,
};
