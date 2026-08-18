const pbClient = require('../../utils/pocketbase');
const { CourseCreditBatchLifecycleService } = require('./batchLifecycleService');
const { CourseCreditConversionService } = require('./conversionService');
const { CourseCreditGrantService } = require('./grantService');
const { CourseCreditExpiryService } = require('./expiryService');
const { CourseCreditOutboxService } = require('./outboxService');
const { CourseCreditMigrationService } = require('./migrationService');
const { createCourseCreditNotificationDispatcher } = require('./notificationDispatcher');
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
const { CourseCreditSessionCancellationService } = require('./sessionCancellationService');
const { CourseCreditSessionSettlementService } = require('./sessionSettlementService');
const { CourseCreditSessionSettlementReversalService } = require('./sessionSettlementReversalService');
const { CourseCreditTeacherCreditService } = require('./teacherCreditService');
const { StudentLearningService } = require('./studentLearningService');
const { AdminResourceCommandService } = require('./adminResourceCommandService');
const { AutomaticEnrollmentService } = require('./enrollmentService');
const { EnrollmentRosterSyncService } = require('./enrollmentRosterSyncService');
const { ManualAttendanceService } = require('./manualAttendanceService');
const { PocketBaseBatchRepository } = require('./repositories');
const { CourseBookingQueryService } = require('./booking/queryService');
const { AppointmentRequestService } = require('./booking/requestService');
const { AppointmentDecisionService } = require('./booking/decisionService');
const { PendingAppointmentService } = require('./booking/pendingLifecycleService');
const { AppointmentCancellationService } = require('./booking/cancellationService');
const { AppointmentRescheduleService } = require('./booking/rescheduleService');
const { TeacherAvailabilityService } = require('./booking/availabilityService');
const { AppointmentWorkerService } = require('./booking/workerService');
const { ScheduleClaimBackfillService } = require('./booking/backfillService');
const { BookingAdminService } = require('./booking/adminService');
const { BookingOpsQueryService } = require('./booking/opsQueryService');
const { ScheduleQueryService } = require('./schedule');
const { CourseCreditShadowService } = require('./shadowService');

function createCourseCreditServices(repository, options = {}) {
    const metrics = options.metrics || defaultCourseCreditMetrics;
    const bookingQueryService = new CourseBookingQueryService(repository, options.bookingQuery);
    const manualAttendanceService = new ManualAttendanceService(repository, options.attendance);
    return {
        adminResourceCommandService: new AdminResourceCommandService(repository, options.adminResources),
        automaticEnrollmentService: new AutomaticEnrollmentService(repository, options.enrollment),
        batchLifecycleService: new CourseCreditBatchLifecycleService(repository),
        bookingQueryService,
        appointmentRequestService: new AppointmentRequestService(
            repository, bookingQueryService, options.appointmentRequest
        ),
        appointmentDecisionService: new AppointmentDecisionService(
            repository, bookingQueryService, options.appointmentDecision
        ),
        pendingAppointmentService: new PendingAppointmentService(repository, options.pendingAppointment),
        appointmentCancellationService: new AppointmentCancellationService(
            repository, options.appointmentCancellation
        ),
        appointmentRescheduleService: new AppointmentRescheduleService(
            repository, bookingQueryService, options.appointmentReschedule
        ),
        teacherAvailabilityService: new TeacherAvailabilityService(repository, options.teacherAvailability),
        appointmentWorkerService: new AppointmentWorkerService(repository, options.appointmentWorker),
        scheduleClaimBackfillService: new ScheduleClaimBackfillService(repository, options.scheduleClaimBackfill),
        bookingAdminService: new BookingAdminService(repository, options.bookingAdmin),
        bookingOpsQueryService: new BookingOpsQueryService(repository),
        classMembershipService: new CourseCreditClassMembershipService(repository),
        conversionService: new CourseCreditConversionService(repository),
        expiryService: new CourseCreditExpiryService(repository, options.expiry),
        enrollmentRosterSyncService: new EnrollmentRosterSyncService(repository, options.enrollmentSync),
        grantService: new CourseCreditGrantService(repository),
        metrics,
        metricsService: new CourseCreditMetricsService(repository, { metrics }),
        manualAttendanceService,
        migrationService: new CourseCreditMigrationService(repository, options.migration),
        queryService: new CourseCreditQueryService(repository, options.query),
        outboxService: new CourseCreditOutboxService(repository, options.outbox),
        opsQueryService: new CourseCreditOpsQueryService(repository),
        reconciliationService: new CourseCreditReconciliationService(repository),
        reservationService: new CourseCreditReservationService(repository),
        scheduleQueryService: new ScheduleQueryService(repository, options.scheduleQuery),
        shadowService: new CourseCreditShadowService(manualAttendanceService, options.shadow),
        sessionPublicationService: new CourseCreditSessionPublicationService(repository),
        sessionCancellationService: new CourseCreditSessionCancellationService(repository),
        sessionRescheduleService: new CourseCreditSessionRescheduleService(repository),
        sessionSettlementService: new CourseCreditSessionSettlementService(repository),
        sessionSettlementReversalService: new CourseCreditSessionSettlementReversalService(repository),
        studentLearningService: new StudentLearningService(repository, options.studentLearning),
        teacherCreditService: new CourseCreditTeacherCreditService(repository),
        repository,
    };
}

async function createDefaultCourseCreditServices(client = pbClient, options = {}) {
    await client.ready;
    await client.ensureAuth();
    const outbox = { ...options.outbox };
    if (!Object.hasOwn(outbox, 'dispatcher')) {
        outbox.dispatcher = createCourseCreditNotificationDispatcher(options.env || process.env, options.notification);
    }
    return createCourseCreditServices(new PocketBaseBatchRepository(client.getClient()), { ...options, outbox });
}

module.exports = {
    createCourseCreditServices,
    createDefaultCourseCreditServices,
};
