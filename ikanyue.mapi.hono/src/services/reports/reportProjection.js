const { parseJsonField, sanitizePrivateFields } = require('../ops/opsUtils');

function projectPublicReport(report = {}) {
    const reportJson = sanitizePrivateFields(parseJsonField(report.reportJson, report) || {});
    const score = reportJson.score || parseJsonField(report.scoreSnapshotJson, {}) || {};
    const sections = normalizeSections(reportJson.sections || reportJson.reportJson?.sections || score.sections || []);

    return sanitizePrivateFields({
        id: report.id || reportJson.id || reportJson.reportId || '',
        reportId: report.id || reportJson.reportId || '',
        title: reportJson.title || '评估报告',
        student: reportJson.student || parseJsonField(report.studentSnapshotJson, {}) || {},
        teacher: reportJson.teacher || parseJsonField(report.teacherSnapshotJson, {}) || {},
        score: {
            totalScore: Number(score.totalScore ?? report.totalScore ?? reportJson.totalScore ?? 0),
            grade: score.grade || report.grade || reportJson.grade || '-',
            sections,
        },
        summary: reportJson.summary || reportJson.overallComment || score.summary || '',
        recommendations: normalizeRecommendations(reportJson.recommendations || reportJson.suggestions || score.recommendations || []),
        sections,
        generatedAt: reportJson.generatedAt || report.created || report.updated || '',
    });
}

function projectReportSummary(report = {}) {
    const projected = projectPublicReport(report);
    return {
        id: report.id || projected.reportId || projected.id,
        title: projected.title,
        totalScore: projected.score.totalScore,
        grade: projected.score.grade,
        generatedAt: projected.generatedAt,
        summary: projected.summary,
    };
}

function normalizeSections(sections = []) {
    if (!Array.isArray(sections)) {
        return [];
    }
    return sections.map((section, index) => ({
        key: section.key || section.id || section.title || `section_${index}`,
        title: section.title || section.label || '评估维度',
        score: section.score ?? section.weightedScore ?? section.totalScore ?? '',
        maxScore: section.maxScore ?? section.fullScore ?? '',
        comment: section.comment || section.summary || section.description || '',
        recommendations: normalizeRecommendations(section.recommendations || section.suggestions || []),
    }));
}

function normalizeRecommendations(recommendations = []) {
    if (typeof recommendations === 'string' && recommendations.trim()) {
        return [recommendations.trim()];
    }
    if (!Array.isArray(recommendations)) {
        return [];
    }
    return recommendations
        .map((item) => {
            if (typeof item === 'string') {
                return item.trim();
            }
            return item?.text || item?.title || item?.content || '';
        })
        .filter(Boolean);
}

module.exports = {
    normalizeRecommendations,
    normalizeSections,
    projectPublicReport,
    projectReportSummary,
};
