const { OpsRepository } = require('../ops/opsRepository');
const { normalizeRecommendations, normalizeSections, projectPublicReport, projectReportSummary } = require('./reportProjection');
const { StudentReportService } = require('./studentReportService');

function createStudentReportService(repository = new OpsRepository()) {
    return new StudentReportService(repository);
}

module.exports = {
    StudentReportService,
    createStudentReportService,
    normalizeRecommendations,
    normalizeSections,
    projectPublicReport,
    projectReportSummary,
};
