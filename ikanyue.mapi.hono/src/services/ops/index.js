const { AuditService } = require('./auditService');
const { OpsAssessmentService } = require('./assessmentService');
const { OpsAuthService } = require('./authService');
const { OpsManagementService } = require('./managementService');
const { OpsRbacService } = require('./rbacService');
const { OpsReportingService } = require('./reportingService');
const { OpsRichTextAssetService } = require('./richTextAssetService');

function createOpsServices(repository = createDefaultRepository()) {
    const auditService = new AuditService(repository);
    const rbacService = new OpsRbacService(repository, auditService);
    return {
        auditService,
        authService: new OpsAuthService(repository, auditService),
        assessmentService: new OpsAssessmentService(repository, rbacService, auditService),
        managementService: new OpsManagementService(repository, rbacService, auditService),
        reportingService: new OpsReportingService(repository, rbacService, auditService),
        richTextAssetService: new OpsRichTextAssetService(repository, rbacService, auditService),
        rbacService,
        repository,
    };
}

function createDefaultRepository() {
    const { OpsRepository } = require('./opsRepository');
    return new OpsRepository();
}

module.exports = { createOpsServices };
