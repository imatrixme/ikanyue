const { effectiveWindows, mergeWindows, overrideWindowsForDate } = require('../booking/availability');
const { normalizeBookingPolicy } = require('../booking/policy');
const { addLocalDays, localDateMinuteToIso, localParts } = require('../booking/time');
const { filterTime } = require('../repositories/operationRepository');
const { escapeFilter, relation, relationId } = require('../queryService');

async function loadTeacherAvailabilityWindows(repository, teacherId, range) {
    const escaped = escapeFilter(teacherId);
    const [offerings, rules, overrides] = await Promise.all([
        repository.list('teacher_course_offerings', {
            filter: `teacherId="${escaped}" && status="active"`,
            sort: 'courseSpecId',
            expand: 'courseSpecId,policyId',
        }),
        repository.list('teacher_availability_rules', {
            filter: `teacherId="${escaped}" && status="active"`, sort: 'weekday,startMinute',
        }),
        repository.list('teacher_availability_overrides', {
            filter: `teacherId="${escaped}" && status="active" && endAt>"${escapeFilter(filterTime(range.from))}"`
                + ` && startAt<"${escapeFilter(filterTime(range.to))}"`,
            sort: 'startAt',
        }),
    ]);
    return offerings.flatMap((offering) => offeringWindows(offering, range,
        rules.filter((rule) => relationId(rule.offeringId) === offering.id),
        overrides.filter((override) => relationId(override.offeringId) === offering.id)));
}

function offeringWindows(offering, range, rules, overrides) {
    const policy = normalizeBookingPolicy(relation(offering, 'policyId'));
    const course = relation(offering, 'courseSpecId');
    const startDate = localParts(range.from).date;
    const endDate = localParts(new Date(Date.parse(range.to) - 1).toISOString()).date;
    const result = [];
    for (let date = startDate; date <= endDate; date = addLocalDays(date, 1)) {
        const weekday = localParts(localDateMinuteToIso(date, 0)).weekday;
        const base = effectiveWindows(date, weekday, policy, rules, offering.availabilityMode, overrides);
        const unavailable = overrides.filter((item) => item.type === 'unavailable')
            .flatMap((item) => overrideWindowsForDate(item, date));
        for (const window of subtractWindows(base, unavailable)) {
            const startAt = localDateMinuteToIso(date, window.startMinute);
            const endAt = localDateMinuteToIso(date, window.endMinute);
            if (Date.parse(endAt) <= Date.parse(range.from) || Date.parse(startAt) >= Date.parse(range.to)) continue;
            result.push({
                offeringId: offering.id,
                course: { courseId: course.id || relationId(offering.courseSpecId), name: course.name || '课程' },
                startAt,
                endAt,
            });
        }
    }
    return result;
}

function subtractWindows(base, blocked) {
    let result = mergeWindows(base.map((window) => ({ ...window })));
    for (const item of mergeWindows(blocked.map((window) => ({ ...window })))) {
        result = result.flatMap((window) => subtractWindow(window, item));
    }
    return result;
}

function subtractWindow(window, blocked) {
    if (blocked.endMinute <= window.startMinute || blocked.startMinute >= window.endMinute) return [window];
    const result = [];
    if (blocked.startMinute > window.startMinute) {
        result.push({ startMinute: window.startMinute, endMinute: blocked.startMinute });
    }
    if (blocked.endMinute < window.endMinute) {
        result.push({ startMinute: blocked.endMinute, endMinute: window.endMinute });
    }
    return result;
}

module.exports = { loadTeacherAvailabilityWindows, offeringWindows, subtractWindow, subtractWindows };
