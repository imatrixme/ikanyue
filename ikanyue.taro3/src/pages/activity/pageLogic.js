import {
    WEEKDAY_LABELS, academyDateKey, academyDateTime, academyParts, academyTimeLabel, addAcademyDays,
} from '../../../utils/academyTime';

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

    const groupStart = new Date(group.startTime).getTime();
    const groupEnd = new Date(group.endTime).getTime();
    if (Number.isNaN(groupStart) || Number.isNaN(groupEnd)) {
        return [];
    }

    return (activities || []).filter((activity) => {
        const start = activity?.startTime ? new Date(activity.startTime).getTime() : NaN;
        return !Number.isNaN(start) && start >= groupStart && start <= groupEnd;
    });
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
    createActivityQueryParams,
    createDateGroups,
    daysWithActivities,
    filterActivitiesByDateGroup,
    formatDateOnly,
    formatTimeOnly,
    mapActivityDetail,
    nextDayWithActivities,
};
