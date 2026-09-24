const normalizeRewardItem = (item = {}) => ({
    description: item.description || '',
    id: item.id || '',
    image: item.image || '',
    name: item.name || '未命名实物',
    pointsPrice: Number(item.pointsPrice || 0),
    sortOrder: Number(item.sortOrder || 0),
    status: item.status === 'inactive' ? 'inactive' : 'active',
});

const normalizePointEvent = (event = {}) => ({
    balanceAfter: toNumber(event.balanceAfter),
    created: typeof event.created === 'string' ? event.created : '',
    delta: toNumber(event.delta),
    id: event.id || '',
    reason: typeof event.reason === 'string' ? event.reason : '',
    remark: typeof event.remark === 'string' ? event.remark : '',
    rewardSnapshot: event.rewardSnapshot && typeof event.rewardSnapshot === 'object' ? event.rewardSnapshot : null,
    studentId: event.studentId || '',
    type: event.type === 'offline_redeem' ? 'offline_redeem' : 'earn',
});

const normalizePointSummary = (payload = {}) => ({
    balance: toNumber(payload.balance),
    events: Array.isArray(payload.events) ? payload.events.map(normalizePointEvent) : [],
    pagination: {
        page: toNumber(payload.pagination?.page, 1),
        perPage: toNumber(payload.pagination?.perPage, 20),
        totalItems: toNumber(payload.pagination?.totalItems),
        totalPages: toNumber(payload.pagination?.totalPages, 1),
    },
    studentId: payload.studentId || '',
});

const getPointEventLabel = (event = {}) => (event.type === 'offline_redeem' ? '线下兑换' : '增加积分');

const getPointEventReason = (event = {}) => {
    const rewardName = event.rewardSnapshot?.name;
    if (rewardName) return rewardName;
    if (event.reason === 'admin_grant') return '管理员发放';
    if (event.reason === 'local_seed' || event.reason === 'seed') return '初始积分';
    if (event.reason === 'offline_redeem') return '线下兑换';
    return event.reason || event.remark || '-';
};

const formatPointEventDelta = (value) => {
    const delta = toNumber(value);
    return `${delta > 0 ? '+' : ''}${delta}`;
};

const formatPointEventDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const mergePointEvents = (current = [], incoming = []) => {
    const knownIds = new Set(current.map((event) => event.id).filter(Boolean));
    return [...current, ...incoming.filter((event) => !event.id || !knownIds.has(event.id))];
};

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
    return missing <= 0 ? '可领取' : `还差 ${missing} 分`;
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
    formatPointEventDate,
    formatPointEventDelta,
    getPointEventLabel,
    getPointEventReason,
    getRewardProgress,
    getRewardStateText,
    mergePointEvents,
    normalizePointEvent,
    normalizeRewardAvailability,
    normalizePointSummary,
    normalizeRewardItem,
    splitRewardsByBalance,
};
