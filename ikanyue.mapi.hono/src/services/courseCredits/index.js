const pbClient = require('../../utils/pocketbase');
const { CourseCreditBatchLifecycleService } = require('./batchLifecycleService');
const { CourseCreditConversionService } = require('./conversionService');
const { CourseCreditGrantService } = require('./grantService');
const { CourseCreditExpiryService } = require('./expiryService');
const { CourseCreditOutboxService } = require('./outboxService');
const { CourseCreditOpsQueryService } = require('./opsQueryService');
const {
    CourseCreditMetricsService,
    defaultCourseCreditMetrics,
} = require('./metricsService');
const { CourseCreditReconciliationService } = require('./reconciliationService');
const { CourseCreditQueryService } = require('./queryService');
const { CourseCreditReservationService } = require('./reservationService');
const { CourseCreditClassMembershipService } = require('./classMembershipService');
const { CourseCreditSessionPublicationService } = require('./sessionPublicationService');
const { CourseCreditSessionRescheduleService } = require('./sessionRescheduleService');
const { CourseCreditSessionSettlementService } = require('./sessionSettlementService');
const { CourseCreditSessionSettlementReversalService } = require('./sessionSettlementReversalService');
const { CourseCreditTeacherCreditService } = require('./teacherCreditService');
const { PocketBaseBatchRepository } = require('./repositories');

function createCourseCreditServices(repository, options = {}) {
    const metrics = options.metrics || defaultCourseCreditMetrics;
    return {
        batchLifecycleService: new CourseCreditBatchLifecycleService(repository),
        classMembershipService: new CourseCreditClassMembershipService(repository),
        conversionService: new CourseCreditConversionService(repository),
        expiryService: new CourseCreditExpiryService(repository, options.expiry),
        grantService: new CourseCreditGrantService(repository),
        metrics,
        metricsService: new CourseCreditMetricsService(repository, { metrics }),
        queryService: new CourseCreditQueryService(repository, options.query),
        outboxService: new CourseCreditOutboxService(repository, options.outbox),
        opsQueryService: new CourseCreditOpsQueryService(repository),
        reconciliationService: new CourseCreditReconciliationService(repository),
        reservationService: new CourseCreditReservationService(repository),
        sessionPublicationService: new CourseCreditSessionPublicationService(repository),
        sessionRescheduleService: new CourseCreditSessionRescheduleService(repository),
        sessionSettlementService: new CourseCreditSessionSettlementService(repository),
        sessionSettlementReversalService: new CourseCreditSessionSettlementReversalService(repository),
        teacherCreditService: new CourseCreditTeacherCreditService(repository),
        repository,
    };
}

async function createDefaultCourseCreditServices(client = pbClient, options = {}) {
    await client.ready;
    await client.ensureAuth();
    return createCourseCreditServices(new PocketBaseBatchRepository(client.getClient()), options);
}

module.exports = {
    createCourseCreditServices,
    createDefaultCourseCreditServices,
};
