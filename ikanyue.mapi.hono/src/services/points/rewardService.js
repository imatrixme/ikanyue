const { normalizeString } = require('../ops/opsUtils');

const REWARD_ITEMS = 'reward_items';

class RewardService {
    constructor(repository) {
        this.repository = repository;
    }

    async listForAdmin(query = {}) {
        const page = Number(query.page || 1);
        const perPage = Number(query.perPage || query.limit || 50);
        return this.repository.list(REWARD_ITEMS, page, perPage, {
            sort: 'sortOrder',
        });
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

    async create(input = {}) {
        const payload = validateRewardPayload(input);
        return this.repository.create(REWARD_ITEMS, payload);
    }

    async update(id, input = {}) {
        const rewardId = normalizeString(id);
        if (!rewardId) {
            throw userError('实物不能为空');
        }
        const existing = await this.repository.get(REWARD_ITEMS, rewardId);
        const payload = validateRewardPayload({ ...existing, ...input });
        return this.repository.update(REWARD_ITEMS, rewardId, payload);
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
        image: typeof item.image === 'string' ? item.image : '',
        name: typeof item.name === 'string' ? item.name : '',
        pointsPrice: toNumber(item.pointsPrice),
    };
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

module.exports = { RewardService, publicReward };
