const { normalizeString } = require('../ops/opsUtils');
const { getFileUrl } = require('../../utils/fileUrl');

const REWARD_ITEMS = 'reward_items';
const MAX_REWARD_IMAGE_SIZE = 5 * 1024 * 1024;
const REWARD_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

class RewardService {
    constructor(repository) {
        this.repository = repository;
    }

    async listForAdmin(operator, query = {}) {
        assertAdmin(operator);
        const page = Number(query.page || 1);
        const perPage = Number(query.perPage || query.limit || 50);
        const result = await this.repository.list(REWARD_ITEMS, page, perPage, {
            sort: 'sortOrder',
        });
        return { ...result, items: (result.items || []).map(adminReward) };
    }

    async listActive() {
        const result = await this.repository.list(REWARD_ITEMS, 1, 200, {
            filter: 'status = "active"',
            sort: 'sortOrder',
        });
        return result.items || [];
    }

    async availability(balance) {
        const currentPoints = toNumber(balance);
        const items = await this.listActive();
        const publicItems = items.map(publicReward);
        return {
            currentPoints,
            lockedItems: publicItems.filter((item) => item.pointsPrice > currentPoints),
            redeemableItems: publicItems.filter((item) => item.pointsPrice <= currentPoints),
        };
    }

    async create(operator, input = {}) {
        assertAdmin(operator);
        const payload = validateRewardPayload(input);
        return adminReward(await this.repository.create(REWARD_ITEMS, payload));
    }

    async update(operator, id, input = {}) {
        assertAdmin(operator);
        const rewardId = normalizeString(id);
        if (!rewardId) {
            throw userError('实物不能为空');
        }
        const existing = await this.repository.get(REWARD_ITEMS, rewardId);
        const payload = validateRewardPayload({ ...existing, ...input });
        return adminReward(await this.repository.update(REWARD_ITEMS, rewardId, payload));
    }

    async uploadImage(operator, id, file) {
        assertAdmin(operator);
        const rewardId = normalizeString(id);
        if (!rewardId) {
            throw userError('实物不能为空');
        }
        validateRewardImage(file);
        await this.repository.get(REWARD_ITEMS, rewardId);
        const updated = await this.repository.update(REWARD_ITEMS, rewardId, { imageFile: file });
        return adminReward(updated);
    }

    async getActiveReward(id) {
        const rewardId = normalizeString(id);
        if (!rewardId) {
            throw userError('实物不能为空');
        }
        const reward = await this.repository.get(REWARD_ITEMS, rewardId);
        if (reward.status !== 'active') {
            throw userError('实物已下线，无法兑换');
        }
        if (toNumber(reward.pointsPrice) <= 0) {
            throw userError('实物积分价格无效');
        }
        return reward;
    }
}

function validateRewardPayload(input = {}) {
    const name = normalizeString(input.name || input.title);
    if (!name) {
        throw userError('实物名称不能为空');
    }
    const pointsPrice = Number(input.pointsPrice);
    if (!Number.isInteger(pointsPrice) || pointsPrice <= 0) {
        throw userError('实物积分价格必须为正整数');
    }
    return {
        description: normalizeString(input.description),
        image: normalizeString(input.image || input.imageUrl),
        name,
        pointsPrice,
        sortOrder: toNumber(input.sortOrder),
        status: input.status === 'inactive' ? 'inactive' : 'active',
    };
}

function publicReward(item = {}) {
    return {
        description: typeof item.description === 'string' ? item.description : '',
        id: item.id,
        image: rewardImageUrl(item),
        name: typeof item.name === 'string' ? item.name : '',
        pointsPrice: toNumber(item.pointsPrice),
    };
}

function adminReward(item = {}) {
    return {
        ...publicReward(item),
        sortOrder: toNumber(item.sortOrder),
        status: item.status === 'inactive' ? 'inactive' : 'active',
    };
}

function rewardImageUrl(item = {}) {
    const imageFile = firstFileName(item.imageFile);
    if (imageFile) {
        return getFileUrl(item, imageFile);
    }
    return typeof item.image === 'string' ? item.image : '';
}

function firstFileName(value) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') {
        return first;
    }
    return first && typeof first.name === 'string' ? first.name : '';
}

function validateRewardImage(file) {
    if (!file || typeof file !== 'object') {
        throw userError('请选择实物图片');
    }
    const size = Number(file.size || 0);
    if (!Number.isFinite(size) || size <= 0) {
        throw userError('实物图片不能为空');
    }
    if (size > MAX_REWARD_IMAGE_SIZE) {
        throw userError('实物图片不能超过 5MB');
    }
    if (!REWARD_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
        throw userError('仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片');
    }
    return file;
}

function assertAdmin(user = {}) {
    if (!user.id || !user.isAdmin) {
        const error = new Error('需要管理员权限');
        error.code = 403;
        throw error;
    }
}

function userError(message) {
    const error = new Error(message);
    error.code = 400;
    return error;
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

module.exports = {
    MAX_REWARD_IMAGE_SIZE,
    RewardService,
    adminReward,
    publicReward,
    rewardImageUrl,
    validateRewardImage,
};
