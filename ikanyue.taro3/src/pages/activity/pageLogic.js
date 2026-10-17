import { IMAGE_DETAIL_URLS, KANYUE_INFO_LINKS, buildImageDetailUrl } from '../../data/kanyueInfoLinks';
import {
    WEEKDAY_LABELS, academyDateKey, academyDateTime, academyParts, academyTimeLabel, addAcademyDays,
} from '../../../utils/academyTime';

const DAY_MS = 86400000;

// Activity days follow the academy clock (Asia/Shanghai), independent of the device timezone.
const createActivityQueryParams = (baseDate = new Date()) => {
    const nextYear = academyParts(baseDate).year + 1;

    return {
        start_time_gte: new Date('2020-01-01').toISOString(),
        start_time_lte: new Date(academyDateTime(`${nextYear + 1}-01-01`).getTime() - 1).toISOString(),
        perPage: 100,
    };
};

const createDateGroups = (baseDate = new Date()) => {
    const groups = [];
    const today = academyDateKey(baseDate);

    for (let i = 0; i < 7; i++) {
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

    groups.push(...KANYUE_INFO_LINKS.map((link) => ({
        title: '',
        dateText: link.title,
        type: 'navigation',
        action: 'navigate-image',
        imageUrl: link.imageUrl,
        detailTitle: link.detailTitle,
    })));

    return groups;
};

const formatDateOnly = (timestamp) => {
    const parts = academyParts(timestamp);
    return parts ? `${parts.month}月${parts.day}日` : '';
};

const formatTimeOnly = (timestamp) => academyTimeLabel(timestamp);

const filterActivitiesByDateGroup = (activities = [], group) => {
    if (!group || group.action === 'navigate-image') {
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
    IMAGE_DETAIL_URLS,
    WEEKDAY_LABELS,
    buildImageDetailUrl,
    createActivityQueryParams,
    createDateGroups,
    filterActivitiesByDateGroup,
    formatDateOnly,
    formatTimeOnly,
    mapActivityDetail,
};
