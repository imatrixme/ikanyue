const { createAdminCourseOperationHandlers } = require('./adminCourseOperationHandlers');
const { createCourseCreditOpsQueryHandlers } = require('./opsQueryHandlers');
const { createStudentAuthorizationHandlers } = require('./studentAuthorizationHandlers');
const { createStudentLearningHandlers } = require('./studentLearningHandlers');
const { createCourseCreditWorkerHandlers } = require('./workerHandlers');

function createCourseCreditHandlerExtensions(options) {
    const {
        capability,
        commandMetadata,
        loadServices,
        metrics,
        queryParams,
        readJsonBody,
        readOptionalJsonBody,
        requireAnyCapability,
        requireCapability,
        requireStudent,
        safeCommand,
        safeQuery,
    } = options;
    return {
        ...createCourseCreditOpsQueryHandlers({
            capability, loadServices, queryParams, requireAnyCapability, requireCapability, safeQuery,
        }),
        ...createCourseCreditWorkerHandlers({
            capability, commandMetadata, loadServices, metrics, readOptionalJsonBody,
            requireCapability, safeCommand,
        }),
        ...createStudentAuthorizationHandlers({
            loadServices, metrics, readJsonBody, requireStudent, safeCommand,
        }),
        ...createStudentLearningHandlers({ loadServices, queryParams, safeQuery }),
        ...createAdminCourseOperationHandlers({
            capability, commandMetadata, loadServices, queryParams, readJsonBody,
            requireAnyCapability, requireCapability, safeCommand, safeQuery,
        }),
    };
}

module.exports = { createCourseCreditHandlerExtensions };
