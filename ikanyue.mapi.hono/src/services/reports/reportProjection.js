const { parseJsonField } = require('../ops/opsUtils');

function projectPublicReport(report = {}) {
    const reportJson = parseJsonField(report.reportJson, report) || {};
    const score = reportJson.score || parseJsonField(report.scoreSnapshotJson, {}) || {};
    const sections = normalizeSections(reportJson.sections || reportJson.reportJson?.sections || score.sections || []);
    const reportId = report.id || reportJson.reportId || reportJson.id || '';
    const reportType = report.reportType || reportJson.reportType || reportJson.type || 'assessment';
    const student = projectPerson(reportJson.student || parseJsonField(report.studentSnapshotJson, {}) || report.student || {});
    const teacher = projectPerson(reportJson.teacher || parseJsonField(report.teacherSnapshotJson, {}) || report.teacher || {});
    const subject = projectReportParty(report.subjectType || reportJson.subjectType || (report.studentId ? 'student' : ''), report.subjectId || report.studentId || reportJson.subjectId, reportJson.subject || student);
    const recipient = projectReportParty(report.recipientType || reportJson.recipientType || (report.studentId ? 'student' : ''), report.recipientId || report.studentId || reportJson.recipientId, reportJson.recipient || student);

    return {
        id: reportId,
        reportId,
        title: reportJson.title || report.title || reportJson.name || '评估报告',
        reportType,
        scope: projectScope(report, reportJson),
        subject,
        recipient,
        student,
        teacher,
        status: report.status || reportJson.status || '',
        publishedAt: report.publishedAt || reportJson.publishedAt || '',
        score: {
            totalScore: Number(score.totalScore ?? report.totalScore ?? reportJson.totalScore ?? 0),
            grade: score.grade || report.grade || reportJson.grade || '-',
            sections,
        },
        summary: reportJson.summary || reportJson.overallComment || score.summary || '',
        recommendations: normalizeRecommendations(reportJson.recommendations || reportJson.suggestions || score.recommendations || []),
        sections,
        generatedAt: reportJson.generatedAt || report.created || report.updated || '',
    };
}

function projectReportSummary(report = {}) {
    const projected = projectPublicReport(report);
    return pickDefined({
        id: report.id || projected.reportId || projected.id,
        title: projected.title,
        reportType: hasReportType(report) ? projected.reportType : undefined,
        scope: hasUsefulObject(projected.scope) ? projected.scope : undefined,
        subject: hasUsefulObject(projected.subject) ? projected.subject : undefined,
        recipient: hasUsefulObject(projected.recipient) ? projected.recipient : undefined,
        status: projected.status || undefined,
        totalScore: projected.score.totalScore,
        grade: projected.score.grade,
        generatedAt: projected.generatedAt,
        publishedAt: projected.publishedAt || undefined,
        summary: projected.summary,
    });
}

function projectReportInstance(record = {}) {
    return projectPublicReport(record);
}

function projectPerson(person = {}) {
    const source = typeof person === 'object' && person ? person : {};
    return pickDefined({
        id: source.id,
        name: source.name || source.realName || source.realname || source.nickName || source.nickname || source.title || '',
        nickName: source.nickName || source.nickname || '',
        realName: source.realName || source.realname || '',
        avatar: source.avatar || source.avatarUrl || '',
        grade: source.grade || '',
        school: source.school || '',
        role: source.role || source.roleLabel || '',
    });
}

function projectReportParty(type = '', id = '', snapshot = {}) {
    const person = projectPerson(snapshot);
    return pickDefined({
        type,
        id: id || person.id || '',
        name: person.name || person.realName || person.nickName || '',
        avatar: person.avatar || '',
        role: person.role || '',
        grade: person.grade || '',
        school: person.school || '',
    });
}

function projectScope(report = {}, reportJson = {}) {
    const source = reportJson.scope || {};
    return pickDefined({
        type: report.scopeType || source.type || '',
        id: report.scopeId || source.id || '',
        title: source.title || report.scopeTitle || '',
    });
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

function pickDefined(value = {}) {
    return Object.entries(value).reduce((acc, [key, item]) => {
        if (item !== undefined && item !== null) {
            acc[key] = item;
        }
        return acc;
    }, {});
}

function hasReportType(report = {}) {
    const reportJson = parseJsonField(report.reportJson, {}) || {};
    return Boolean(report.reportType || reportJson.reportType || reportJson.type);
}

function hasUsefulObject(value = {}) {
    return Object.values(value).some((item) => item !== '');
}

module.exports = {
    normalizeRecommendations,
    normalizeSections,
    projectPerson,
    projectPublicReport,
    projectReportInstance,
    projectReportSummary,
};
