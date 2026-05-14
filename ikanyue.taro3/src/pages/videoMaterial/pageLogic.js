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

const buildFavoriteStatus = (favoriteVideos = []) => {
    return favoriteVideos.reduce((status, video) => {
        status[video.id] = true;
        return status;
    }, {});
};

const shouldLoadMore = ({ activeTab, hasMore, loadingMore }) => {
    return activeTab === 'all' && Boolean(hasMore) && !loadingMore;
};

const buildVideoDetailUrl = (video) => `/pages/videoMaterial/detail/index?id=${video.id}`;

const applyVideoDetailResponse = (response = {}) => ({
    detail: response,
    duration: response.duration || 0,
});

export {
    MATERIAL_PAGE_SIZE,
    applyMaterialListResponse,
    applyVideoDetailResponse,
    buildFavoriteStatus,
    buildVideoDetailUrl,
    createMaterialListParams,
    shouldLoadMore,
    sortFavoritesByTimeDesc,
};
