import {
    WEEKDAY_LABELS, academyDateKey, academyDateTime, academyParts, academyTimeLabel, addAcademyDays, toDate,
} from './academyTime.js';

const DAY_MS = 86400000;
const STRIP_DAYS = 7;

// Activity days follow the academy clock (Asia/Shanghai), independent of the device timezone.
// The query covers exactly the date strip so older activities never crowd out upcoming ones.
const createActivityQueryParams = (baseDate = new Date()) => {
    const today = academyDateKey(baseDate);

    return {
        start_time_gte: academyDateTime(today).toISOString(),
        start_time_lte: new Date(academyDateTime(addAcademyDays(today, STRIP_DAYS)).getTime() - 1).toISOString(),
        sort: 'startTime',
        perPage: 100,
    };
};

const createDateGroups = (baseDate = new Date()) => {
    const groups = [];
    const today = academyDateKey(baseDate);

    for (let i = 0; i < STRIP_DAYS; i++) {
        const dateKey = addAcademyDays(today, i);
        const start = academyDateTime(dateKey);
        const parts = academyParts(start);
        groups.push({
            title: i === 0 ? '今天' : WEEKDAY_LABELS[parts.weekday],
            dateText: `${parts.month}月${parts.day}日`,
            dateKey,
            day: String(parts.day).padStart(2, '0'),
            month: `${String(parts.month).padStart(2, '0')}月`,
            type: 'day',
            startTime: start,
            endTime: new Date(start.getTime() + DAY_MS - 1),
        });
    }

    return groups;
};

const formatDateOnly = (timestamp) => {
    const parts = academyParts(timestamp);
    return parts ? `${parts.month}月${parts.day}日` : '';
};

const formatTimeOnly = (timestamp) => academyTimeLabel(timestamp);

const filterActivitiesByDateGroup = (activities = [], group) => {
    if (!group) {
        return [];
    }

    const groupStart = toDate(group.startTime);
    const groupEnd = toDate(group.endTime);
    if (!groupStart || !groupEnd) {
        return [];
    }

    return (activities || []).filter((activity) => {
        const start = toDate(activity?.startTime);
        return Boolean(start) && start >= groupStart && start <= groupEnd;
    });
};

// Display fields for <activity-ticket>; the list and the detail page word a free activity differently.
const activityTicket = (activity = {}, freeLabel = '免费') => {
    const start = formatTimeOnly(activity.startTime);
    const end = formatTimeOnly(activity.endTime);
    const price = Number(activity.price || 0);
    return {
        dateText: formatDateOnly(activity.startTime),
        priceLabel: price > 0 ? `¥${(price / 100).toFixed(2)}` : freeLabel,
        tags: String(activity.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
        timeText: end ? `${start} - ${end}` : start,
    };
};

// Indexes of strip days that have at least one activity, for the day markers.
const daysWithActivities = (groups = [], activities = []) => groups
    .map((group, index) => (filterActivitiesByDateGroup(activities, group).length ? index : -1))
    .filter((index) => index >= 0);

// First day after `fromIndex` that has an activity, or -1 when the rest of the strip is empty.
const nextDayWithActivities = (groups = [], activities = [], fromIndex = 0) => (
    daysWithActivities(groups, activities).find((index) => index > fromIndex) ?? -1
);

const mapActivityDetail = (currentActivity, response) => {
    if (!response) {
        return null;
    }

    return {
        ...currentActivity,
        id: response.id,
        title: response.title,
        description: response.description || '',
        coverImage: response.coverImageUrl,
        images: response.imageUrls || response.images || [],
        startTime: response.startTime,
        endTime: response.endTime,
        location: response.location,
        price: response.price,
        externalLink: response.external_link || response.externalLink,
        tags: response.tags || [],
        maxParticipants: response.max_participants || response.maxParticipants || 0,
        currentParticipants: response.current_participants || response.currentParticipants || 0,
    };
};

export {
    WEEKDAY_LABELS,
    activityTicket,
    createActivityQueryParams,
    createDateGroups,
    daysWithActivities,
    filterActivitiesByDateGroup,
    formatDateOnly,
    formatTimeOnly,
    mapActivityDetail,
    nextDayWithActivities,
};
