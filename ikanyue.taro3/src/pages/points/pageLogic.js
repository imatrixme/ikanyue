const normalizeRewardItem = (item = {}) => ({
    description: item.description || '',
    id: item.id || '',
    image: item.image || '',
    name: item.name || '未命名实物',
    pointsPrice: Number(item.pointsPrice || 0),
    sortOrder: Number(item.sortOrder || 0),
    status: item.status === 'inactive' ? 'inactive' : 'active',
});

const normalizePointSummary = (payload = {}) => ({
    balance: Number(payload.balance || 0),
    events: Array.isArray(payload.events) ? payload.events : [],
    studentId: payload.studentId || '',
});

const normalizeRewardList = (items = []) => {
    return items
        .map(normalizeRewardItem)
        .filter((item) => item.status === 'active')
        .sort((left, right) => left.pointsPrice - right.pointsPrice || left.sortOrder - right.sortOrder);
};

const splitRewardsByBalance = (items = [], balance = 0) => {
    const activeItems = normalizeRewardList(items);
    return {
        redeemable: activeItems.filter((item) => item.pointsPrice <= balance),
        locked: activeItems.filter((item) => item.pointsPrice > balance),
    };
};

const normalizeRewardAvailability = (payload = {}, balance = 0) => {
    const currentPoints = toNumber(payload.currentPoints, balance);
    if (Array.isArray(payload.redeemableItems) || Array.isArray(payload.lockedItems)) {
        return {
            currentPoints,
            redeemable: normalizeRewardList(payload.redeemableItems || []),
            locked: normalizeRewardList(payload.lockedItems || []),
        };
    }
    return {
        currentPoints,
        ...splitRewardsByBalance(payload.items || [], currentPoints),
    };
};

const formatPoints = (value) => `${Number(value || 0)} 分`;

const getRewardStateText = (item, balance) => {
    const missing = Number(item?.pointsPrice || 0) - Number(balance || 0);
    return missing <= 0 ? '可兑换' : `还差 ${missing} 分`;
};

const getRewardProgress = (item, balance) => {
    const price = Number(item?.pointsPrice || 0);
    const points = Number(balance || 0);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(points)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round((points / price) * 100)));
};

const toNumber = (value, fallback = 0) => {
    const number = Number(value ?? fallback);
    return Number.isFinite(number) ? number : Number(fallback || 0);
};

export {
    formatPoints,
    getRewardProgress,
    getRewardStateText,
    normalizeRewardAvailability,
    normalizePointSummary,
    normalizeRewardItem,
    splitRewardsByBalance,
};
