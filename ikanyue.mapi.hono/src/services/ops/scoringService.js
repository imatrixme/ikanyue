const SUPPORTED_ITEM_TYPES = ['single_choice', 'multi_choice', 'score_slider', 'number_score', 'textarea', 'rich_comment'];
const SUPPORTED_SCORING_TYPES = ['weighted_sum', 'rubric_sum'];

function validateAssessmentTemplate(template = {}) {
    const errors = [];
    if (!template.name || !String(template.name).trim()) {
        errors.push('模板名称不能为空');
    }

    const schema = template.schemaJson || template.schema || {};
    const sections = Array.isArray(schema.sections) ? schema.sections : [];
    if (sections.length === 0) {
        errors.push('评估模板至少需要一个维度');
    }

    const keys = new Set();
    sections.forEach((section, sectionIndex) => {
        validateKey(section.key, `sections[${sectionIndex}].key`, keys, errors);
        if (!section.title || !String(section.title).trim()) {
            errors.push(`维度 ${section.key || sectionIndex} 缺少标题`);
        }
        const items = Array.isArray(section.items) ? section.items : [];
        if (items.length === 0) {
            errors.push(`维度 ${section.key || sectionIndex} 至少需要一个评估项`);
        }
        items.forEach((item, itemIndex) => {
            validateKey(item.key, `items[${itemIndex}].key`, keys, errors);
            if (!SUPPORTED_ITEM_TYPES.includes(item.type)) {
                errors.push(`评估项 ${item.key || itemIndex} 类型不支持`);
            }
            if (['single_choice', 'multi_choice'].includes(item.type) && !Array.isArray(item.options)) {
                errors.push(`评估项 ${item.key || itemIndex} 缺少选项`);
            }
        });
    });

    const scoring = template.scoringJson || schema.scoring || template.scoring || {};
    if (!SUPPORTED_SCORING_TYPES.includes(scoring.type || 'weighted_sum')) {
        errors.push('评分规则类型不支持');
    }

    const totalWeight = sections.reduce((sum, section) => sum + Number(section.weight || 0), 0);
    if ((scoring.type || 'weighted_sum') === 'weighted_sum' && Math.abs(totalWeight - 1) > 0.01) {
        errors.push('加权评分维度权重之和必须为1');
    }

    return { valid: errors.length === 0, errors };
}

function scoreAssessment(template = {}, answers = {}) {
    const schema = template.schemaJson || template.schema || {};
    const sections = Array.isArray(schema.sections) ? schema.sections : [];
    const scoring = template.scoringJson || schema.scoring || template.scoring || {};
    const maxScore = Number(scoring.maxScore || 100);

    const sectionScores = sections.map((section) => scoreSection(section, answers, maxScore));
    const scoringType = scoring.type || 'weighted_sum';
    const totalScore = scoringType === 'rubric_sum'
        ? Math.min(maxScore, sectionScores.reduce((sum, section) => sum + section.rawScore, 0))
        : sectionScores.reduce((sum, section) => sum + section.weightedScore, 0);
    const roundedScore = Math.round(totalScore * 100) / 100;

    return {
        totalScore: roundedScore,
        grade: resolveGrade(roundedScore, scoring.gradeBands || []),
        sectionScores,
        ruleTrace: sectionScores.flatMap((section) => section.itemScores.map((item) => ({
            sectionKey: section.key,
            itemKey: item.key,
            score: item.score,
        }))),
    };
}

function scoreSection(section, answers, maxScore) {
    const items = Array.isArray(section.items) ? section.items : [];
    const itemScores = items.map((item) => scoreItem(item, answers[item.key]));
    const scoreableItems = itemScores.filter((item) => item.scoreable);
    const rawScore = scoreableItems.length === 0
        ? 0
        : scoreableItems.reduce((sum, item) => sum + item.score, 0) / scoreableItems.length;
    const weight = Number(section.weight || 0);
    return {
        key: section.key,
        title: section.title,
        rawScore: Math.round(rawScore * 100) / 100,
        weightedScore: Math.round(rawScore * weight * 100) / 100,
        weight,
        maxScore,
        itemScores,
    };
}

function scoreItem(item, answer) {
    if (item.type === 'textarea' || item.type === 'rich_comment') {
        return { key: item.key, score: 0, scoreable: false };
    }
    if (item.type === 'number_score' || item.type === 'score_slider') {
        return { key: item.key, score: Number(answer || 0), scoreable: true };
    }
    if (item.type === 'single_choice') {
        const option = (item.options || []).find((candidate) => candidate.value === answer);
        return { key: item.key, score: Number(option?.score || 0), scoreable: true };
    }
    if (item.type === 'multi_choice') {
        const selected = Array.isArray(answer) ? answer : [];
        const score = (item.options || [])
            .filter((candidate) => selected.includes(candidate.value))
            .reduce((sum, candidate) => sum + Number(candidate.score || 0), 0);
        return { key: item.key, score, scoreable: true };
    }
    return { key: item.key, score: 0, scoreable: false };
}

function resolveGrade(score, gradeBands) {
    const sorted = [...gradeBands].sort((a, b) => Number(b.min || 0) - Number(a.min || 0));
    const band = sorted.find((candidate) => score >= Number(candidate.min || 0));
    return band?.label || '';
}

function validateKey(key, label, keys, errors) {
    if (!key || !String(key).trim()) {
        errors.push(`${label} 不能为空`);
        return;
    }
    if (keys.has(key)) {
        errors.push(`字段 key 重复: ${key}`);
        return;
    }
    keys.add(key);
}

module.exports = {
    SUPPORTED_ITEM_TYPES,
    scoreAssessment,
    validateAssessmentTemplate,
};
