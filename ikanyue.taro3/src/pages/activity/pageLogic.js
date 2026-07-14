const IMAGE_DETAIL_URLS = {
    about: 'https://kyoss.abcmem.com/ikanyue-public/guanyu-kanyue.JPG',
    learnWhat: 'https://kyoss.abcmem.com/ikanyue-public/zai-kanyue-xue-shenme.JPG',
};

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const createActivityQueryParams = (baseDate = new Date()) => {
    const now = new Date(baseDate);
    const startDate = new Date('2020-01-01');
    const endDate = new Date(now.getFullYear() + 1, 11, 31);

    return {
        start_time_gte: startDate.toISOString(),
        start_time_lte: endDate.toISOString(),
        perPage: 100,
    };
};

const createDateGroups = (baseDate = new Date()) => {
    const groups = [];
    const now = new Date(baseDate);
    now.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() + i);
        groups.push({
            title: i === 0 ? '今天' : WEEKDAY_LABELS[date.getDay()],
            dateText: `${date.getMonth() + 1}月${date.getDate()}日`,
            date,
            type: 'day',
            startTime: date,
            endTime: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
        });
    }

    groups.push({
        title: '',
        dateText: '看乐教学',
        type: 'navigation',
        action: 'navigate-image',
        imageUrl: IMAGE_DETAIL_URLS.learnWhat,
        detailTitle: '看乐教学',
    });

    groups.push({
        title: '',
        dateText: '关于看乐',
        type: 'navigation',
        action: 'navigate-image',
        imageUrl: IMAGE_DETAIL_URLS.about,
        detailTitle: '关于看乐',
    });

    return groups;
};

const formatDateOnly = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const formatTimeOnly = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const filterActivitiesByDateGroup = (activities = [], group) => {
    if (!group || group.action === 'navigate-image') {
        return [];
    }

    const groupStart = new Date(group.startTime);
    const groupEnd = new Date(group.endTime);
    if (Number.isNaN(groupStart.getTime()) || Number.isNaN(groupEnd.getTime())) {
        return [];
    }

    const groupStartUtc = Date.UTC(
        groupStart.getFullYear(),
        groupStart.getMonth(),
        groupStart.getDate(),
        groupStart.getHours(),
        groupStart.getMinutes(),
        groupStart.getSeconds()
    );
    const groupEndUtc = Date.UTC(
        groupEnd.getFullYear(),
        groupEnd.getMonth(),
        groupEnd.getDate(),
        groupEnd.getHours(),
        groupEnd.getMinutes(),
        groupEnd.getSeconds()
    );

    return activities.filter((activity) => {
        if (!activity.startTime) {
            return false;
        }

        const activityDate = new Date(activity.startTime);
        if (Number.isNaN(activityDate.getTime())) {
            return false;
        }

        const activityUtc = Date.UTC(
            activityDate.getFullYear(),
            activityDate.getMonth(),
            activityDate.getDate(),
            activityDate.getHours(),
            activityDate.getMinutes(),
            activityDate.getSeconds()
        );

        return activityUtc >= groupStartUtc && activityUtc <= groupEndUtc;
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

const buildImageDetailUrl = (group) => {
    if (!group?.imageUrl) {
        return '';
    }

    const params = [`imageUrl=${encodeURIComponent(group.imageUrl)}`];
    if (group.detailTitle) {
        params.push(`title=${encodeURIComponent(group.detailTitle)}`);
    }
    return `/pages/imageDetail/index?${params.join('&')}`;
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
