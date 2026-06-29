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

const splitRewardsByBalance = (items = [], balance = 0) => {
    const activeItems = items
        .map(normalizeRewardItem)
        .filter((item) => item.status === 'active')
        .sort((left, right) => left.pointsPrice - right.pointsPrice || left.sortOrder - right.sortOrder);

    return {
        redeemable: activeItems.filter((item) => item.pointsPrice <= balance),
        locked: activeItems.filter((item) => item.pointsPrice > balance),
    };
};

const formatPoints = (value) => `${Number(value || 0)} 分`;

const getRewardStateText = (item, balance) => {
    const missing = Number(item?.pointsPrice || 0) - Number(balance || 0);
    return missing <= 0 ? '可兑换' : `还差 ${missing} 分`;
};

export {
    formatPoints,
    getRewardStateText,
    normalizePointSummary,
    normalizeRewardItem,
    splitRewardsByBalance,
};
