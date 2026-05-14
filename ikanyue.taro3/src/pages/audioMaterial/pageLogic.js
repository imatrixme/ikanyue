const MATERIAL_PAGE_SIZE = 20;

const createMaterialListParams = (page = 1, pageSize = MATERIAL_PAGE_SIZE) => ({
    page,
    perPage: pageSize,
    status: 'published',
    sort: '-sequence',
});

const applyMaterialListResponse = (response = {}, page = 1, pageSize = MATERIAL_PAGE_SIZE) => {
    const items = response.items || [];

    return {
        items,
        totalItems: response.totalItems || 0,
        currentPage: page,
        hasMore: items.length >= pageSize,
    };
};

const sortFavoritesByTimeDesc = (items = []) => {
    return [...items].sort((a, b) => new Date(b.favoriteTime) - new Date(a.favoriteTime));
};

const buildFavoriteStatus = (items = [], favoriteIds = []) => {
    return items.reduce((status, item) => {
        status[item.id] = favoriteIds.includes(item.id);
        return status;
    }, {});
};

const shouldLoadMore = ({ activeTab, hasMore, loadingMore }) => {
    return activeTab === 'all' && Boolean(hasMore) && !loadingMore;
};

const buildAudioDetailUrl = (audio) => `/pages/audioMaterial/detail/index?id=${audio.id}`;

const applyAudioDetailResponse = (response = {}) => ({
    detail: response,
    duration: response.duration || 0,
});

export {
    MATERIAL_PAGE_SIZE,
    applyAudioDetailResponse,
    applyMaterialListResponse,
    buildAudioDetailUrl,
    buildFavoriteStatus,
    createMaterialListParams,
    shouldLoadMore,
    sortFavoritesByTimeDesc,
};
