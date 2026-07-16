const { AuditService } = require('./auditService');
const { OpsAuthService } = require('./authService');
const { StudentAdminService } = require('./studentAdminService');
const { createPointServices } = require('../points');

function createOpsServices(repository = createDefaultRepository()) {
    const auditService = new AuditService(repository);
    const pointServices = createPointServices(repository, auditService);
    return {
        auditService,
        authService: new OpsAuthService(repository, auditService),
        studentAdminService: new StudentAdminService(repository, auditService),
        ...pointServices,
        repository,
    };
}

function createDefaultRepository() {
    const { OpsRepository } = require('./opsRepository');
    return new OpsRepository();
}

module.exports = { createOpsServices };
