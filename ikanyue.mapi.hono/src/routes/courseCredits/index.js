const { authMiddleware } = require('../../middleware/auth');
const { opsAuthMiddleware, opsPasswordChangeGuard } = require('../../middleware/opsAuth');
const { createCourseCreditHandlers } = require('./handlers');

function courseCreditRoutes(routes, handlers = createCourseCreditHandlers()) {
    adminCourseOperationRoutes(routes, handlers);
    routes.post('/ops/course-credits/orders/:orderId/grant')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.grantOrderCredits);
    routes.post('/ops/course-credits/classes/:classId/students/:studentId/membership')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.setStudentMembership);
    routes.post('/ops/course-credits/classes/:classId/students/:studentId/transfer')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.transferStudent);
    routes.post('/ops/course-credits/classes/:classId/teachers/:teacherId/assignment')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.setTeacherAssignment);
    routes.post('/ops/course-credits/sessions/:sessionId/publish')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.publishSession);
    routes.post('/ops/course-credits/teacher-events/:teacherCreditEventId/confirm')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.confirmTeacherCredit);
    routes.get('/ops/course-credits/outbox/dead-letters')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.listOutboxDeadLetters);
    routes.get('/ops/course-credits/metrics')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.getMetrics);
    routes.post('/ops/course-credits/workers/expiry/run')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.runExpiryWorker);
    routes.post('/ops/course-credits/workers/outbox/deliver')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.runOutboxWorker);
    routes.post('/ops/course-credits/batches/:batchId/extend')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.extendBatchExpiry);
    routes.post('/ops/course-credits/batches/:batchId/restore-expired')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.restoreExpiredQuantity);
    routes.post('/ops/course-credits/sessions/:sessionId/reschedule')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.rescheduleSession);
    routes.post('/ops/course-credits/sessions/:sessionId/settle')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.settleSession);
    routes.post('/ops/course-credits/sessions/:sessionId/reverse-settlement')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.reverseSessionSettlement);
    routes.post('/ops/course-credits/reconciliation/runs')
        .use(opsAuthMiddleware, opsPasswordChangeGuard)
        .handler(handlers.runReconciliation);
    opsQueryRoutes(routes, handlers);
    routes.get('/v1/student/learning/overview')
        .use(authMiddleware)
        .handler(handlers.getLearningOverview);
    routes.get('/v1/student/learning/courses/:courseId')
        .use(authMiddleware)
        .handler(handlers.getLearningCourse);
    routes.get('/v1/student/learning/lessons')
        .use(authMiddleware)
        .handler(handlers.listLearningLessons);
    routes.get('/v1/student/learning/lessons/:lessonId')
        .use(authMiddleware)
        .handler(handlers.getLearningLesson);
    routes.get('/v1/student/learning/records')
        .use(authMiddleware)
        .handler(handlers.listLearningRecords);
    routes.post('/v1/course-credits/session-students/:sessionStudentId/reserve')
        .use(authMiddleware)
        .handler(handlers.reserveSessionCredit);
    routes.get('/v1/course-credits/summary')
        .use(authMiddleware)
        .handler(handlers.getStudentSummary);
    routes.get('/v1/course-credits/batches')
        .use(authMiddleware)
        .handler(handlers.listStudentBatches);
    routes.get('/v1/course-credits/batches/:batchId')
        .use(authMiddleware)
        .handler(handlers.getStudentBatch);
    routes.get('/v1/course-credits/events')
        .use(authMiddleware)
        .handler(handlers.listStudentEvents);
    routes.get('/v1/course-credits/conversion-rules')
        .use(authMiddleware)
        .handler(handlers.listStudentConversionRules);
    routes.post('/v1/course-credits/conversions/preview')
        .use(authMiddleware)
        .handler(handlers.previewStudentConversion);
    routes.post('/v1/course-credits/conversions')
        .use(authMiddleware)
        .handler(handlers.convertStudentCredits);
    routes.post('/v1/course-credits/conversion-authorizations')
        .use(authMiddleware)
        .handler(handlers.authorizeStudentConversion);
    routes.get('/v1/course-credits/sessions')
        .use(authMiddleware)
        .handler(handlers.listStudentSessions);
}

function adminCourseOperationRoutes(routes, handlers) {
    const resources = [
        ['course-specs', handlers.createCourseSpec, handlers.updateCourseSpec, handlers.setCourseSpecStatus],
        ['packages', handlers.createPackage, handlers.updatePackage, handlers.setPackageStatus],
        ['grant-lines', handlers.createGrantLine, handlers.updateGrantLine, null],
        ['price-versions', handlers.createPriceVersion, handlers.revisePriceVersion, handlers.setPriceVersionStatus],
        ['classes', handlers.createClass, handlers.updateClass, handlers.setClassStatus],
        ['lessons', handlers.createLesson, handlers.updateLesson, handlers.setLessonStatus],
    ];
    for (const [path, createHandler, updateHandler, statusHandler] of resources) {
        routes.post(`/ops/course-operations/${path}`)
            .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(createHandler);
        routes.patch(`/ops/course-operations/${path}/:id`)
            .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(updateHandler);
        if (statusHandler) {
            routes.post(`/ops/course-operations/${path}/:id/status`)
                .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(statusHandler);
        }
    }
    routes.post('/ops/course-operations/enrollments')
        .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handlers.createEnrollment);
    routes.get('/ops/course-operations/enrollments/:orderId/sync-preview')
        .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handlers.previewEnrollmentSync);
    routes.post('/ops/course-operations/enrollments/:orderId/sync')
        .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handlers.confirmEnrollmentSync);
    routes.post('/ops/course-operations/lessons/:sessionId/students/:sessionStudentId/attendance')
        .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handlers.setManualAttendance);
    routes.post('/ops/course-operations/lessons/:sessionId/attendance/all-present')
        .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handlers.markAllPresent);
    routes.post('/ops/course-operations/lessons/:sessionId/teachers/:sessionTeacherId/actual-status')
        .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handlers.setActualTeacher);
    routes.get('/ops/course-operations/lessons/:sessionId/settlement-preview')
        .use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handlers.previewSessionSettlement);
}

function opsQueryRoutes(routes, handlers) {
    const definitions = [
        ['/ops/course-credits/catalog/course-specs', handlers.listCourseSpecs],
        ['/ops/course-credits/catalog/course-specs/:id', handlers.getCourseSpec],
        ['/ops/course-credits/catalog/credit-types', handlers.listCreditTypes],
        ['/ops/course-credits/catalog/credit-types/:id', handlers.getCreditType],
        ['/ops/course-credits/packages', handlers.listPackages],
        ['/ops/course-credits/packages/:id', handlers.getPackage],
        ['/ops/course-credits/package-grant-lines', handlers.listGrantLines],
        ['/ops/course-credits/package-grant-lines/:id', handlers.getGrantLine],
        ['/ops/course-credits/price-versions', handlers.listPriceVersions],
        ['/ops/course-credits/price-versions/:id', handlers.getPriceVersion],
        ['/ops/course-credits/orders', handlers.listOrders],
        ['/ops/course-credits/orders/:id', handlers.getOrder],
        ['/ops/course-credits/enrollments', handlers.listEnrollments],
        ['/ops/course-credits/enrollments/:id', handlers.getEnrollment],
        ['/ops/course-credits/accounts', handlers.listCreditAccounts],
        ['/ops/course-credits/accounts/:studentId', handlers.getCreditAccount],
        ['/ops/course-credits/conversion-rules', handlers.listConversionRules],
        ['/ops/course-credits/conversion-rules/:id', handlers.getConversionRule],
        ['/ops/course-credits/classes', handlers.listClasses],
        ['/ops/course-credits/classes/:id', handlers.getClass],
        ['/ops/course-credits/class-students', handlers.listClassStudents],
        ['/ops/course-credits/class-students/:id', handlers.getClassStudent],
        ['/ops/course-credits/class-teachers', handlers.listClassTeachers],
        ['/ops/course-credits/class-teachers/:id', handlers.getClassTeacher],
        ['/ops/course-credits/sessions', handlers.listSessions],
        ['/ops/course-credits/sessions/:id', handlers.getSession],
        ['/ops/course-credits/session-classes', handlers.listSessionClasses],
        ['/ops/course-credits/session-classes/:id', handlers.getSessionClass],
        ['/ops/course-credits/session-students', handlers.listSessionStudents],
        ['/ops/course-credits/session-students/:id', handlers.getSessionStudent],
        ['/ops/course-credits/session-teachers', handlers.listSessionTeachers],
        ['/ops/course-credits/session-teachers/:id', handlers.getSessionTeacher],
        ['/ops/course-credits/settlement-exceptions', handlers.listSettlementExceptions],
        ['/ops/course-credits/settlement-exceptions/:id', handlers.getSettlementException],
        ['/ops/course-credits/teacher-events', handlers.listTeacherEvents],
        ['/ops/course-credits/teacher-events/:id', handlers.getTeacherEvent],
        ['/ops/course-credits/reconciliation/runs', handlers.listReconciliationRuns],
        ['/ops/course-credits/reconciliation/runs/:id', handlers.getReconciliationRun],
        ['/ops/course-credits/reconciliation/exceptions', handlers.listReconciliationExceptions],
        ['/ops/course-credits/reconciliation/exceptions/:id', handlers.getReconciliationException],
        ['/ops/course-credits/audit-logs', handlers.listAuditLogs],
        ['/ops/course-credits/audit-logs/:id', handlers.getAuditLog],
        ['/ops/course-credits/assigned-students', handlers.listAssignedStudents],
        ['/ops/course-credits/assigned-classes', handlers.listAssignedClasses],
        ['/ops/course-credits/assigned-lessons', handlers.listAssignedLessons],
    ];
    for (const [path, handler] of definitions) {
        routes.get(path).use(opsAuthMiddleware, opsPasswordChangeGuard).handler(handler);
    }
}

module.exports = courseCreditRoutes;
