const { normalizeString } = require('../ops/opsUtils');

const POINT_EVENTS = 'point_events';
const STUDENT_POINTS = 'student_points';

class PointService {
    constructor(repository, auditService = null) {
        this.repository = repository;
        this.auditService = auditService;
    }

    async getStudentSummary(studentId, { page = 1, perPage = 20 } = {}) {
        const normalizedStudentId = requireId(studentId, '学员不能为空');
        const account = await this.ensureAccount(normalizedStudentId);
        const events = await this.repository.list(POINT_EVENTS, toPositivePage(page, 1), toPositivePage(perPage, 20), {
            filter: `studentId = "${normalizedStudentId}"`,
            sort: '-created',
        });
        return {
            balance: toNumber(account.balance),
            events: Array.isArray(events.items) ? events.items : [],
            pagination: pagination(events),
            studentId: normalizedStudentId,
        };
    }

    async listStudentBalances(query = {}) {
        const page = toPositivePage(query.page, 1);
        const perPage = toPositivePage(query.perPage || query.limit, 20);
        const keyword = normalizeString(query.q || query.keyword);
        const filter = keyword
            ? `(realName ~ "${keyword}" || nickName ~ "${keyword}" || cellphone ~ "${keyword}")`
            : '';
        const students = await this.repository.list('students', page, perPage, {
            fields: 'id,realName,nickName,cellphone,avatar,created,updated',
            filter: [filter, 'blocked = false'].filter(Boolean).join(' && '),
            sort: '-updated',
        });
        const items = await Promise.all((students.items || []).map(async (student) => {
            const account = await this.findAccount(student.id);
            return {
                avatar: normalizeString(student.avatar),
                balance: toNumber(account?.balance),
                cellphone: normalizeString(student.cellphone),
                id: student.id,
                nickName: normalizeString(student.nickName),
                realName: normalizeString(student.realName),
            };
        }));
        return {
            items,
            pagination: pagination(students),
        };
    }

    async addPoints(operator, input = {}) {
        assertAdmin(operator);
        const studentId = requireId(input.studentId, '学员不能为空');
        const amount = positiveInteger(input.amount, '积分必须为正整数');
        const reason = normalizeString(input.reason);
        const remark = normalizeString(input.remark);
        const result = await this.applyDelta({
            delta: amount,
            operator,
            reason: reason === '' ? 'admin_grant' : reason,
            remark,
            studentId,
            type: 'earn',
        });
        await this.audit('ops.points.add', operator, studentId, { amount, reason });
        return result;
    }

    async offlineRedeem(operator, input = {}, rewardService) {
        assertAdmin(operator);
        const studentId = requireId(input.studentId, '学员不能为空');
        const itemId = requireId(input.itemId, '实物不能为空');
        const reward = await rewardService.getActiveReward(itemId);
        const current = await this.ensureAccount(studentId);
        const price = toNumber(reward.pointsPrice);

        if (toNumber(current.balance) < price) {
            const error = new Error('积分不足，无法兑换该实物');
            error.code = 400;
            throw error;
        }

        const result = await this.applyDelta({
            delta: -price,
            operator,
            reason: 'offline_redeem',
            remark: normalizeString(input.remark),
            rewardItemId: reward.id,
            rewardSnapshot: {
                id: reward.id,
                name: reward.name,
                pointsPrice: price,
            },
            studentId,
            type: 'offline_redeem',
        });
        await this.audit('ops.points.offline_redeem', operator, studentId, { itemId: reward.id, pointsPrice: price });
        return { ...result, reward };
    }

    async ensureAccount(studentId) {
        const existing = await this.findAccount(studentId);
        if (existing) {
            return existing;
        }
        return this.repository.create(STUDENT_POINTS, {
            balance: 0,
            studentId,
        });
    }

    async findAccount(studentId) {
        const result = await this.repository.list(STUDENT_POINTS, 1, 1, {
            filter: `studentId = "${studentId}"`,
        });
        return result.items?.[0] || null;
    }

    async applyDelta(params) {
        const account = await this.ensureAccount(params.studentId);
        const currentBalance = toNumber(account.balance);
        const nextBalance = currentBalance + params.delta;
        if (nextBalance < 0) {
            const error = new Error('积分不足');
            error.code = 400;
            throw error;
        }

        const updatedAccount = await this.repository.update(STUDENT_POINTS, account.id, {
            balance: nextBalance,
        });
        const rewardItemId = typeof params.rewardItemId === 'string' ? params.rewardItemId : '';
        const rewardSnapshot = params.rewardSnapshot === undefined ? null : params.rewardSnapshot;
        const operator = params.operator && typeof params.operator === 'object' ? params.operator : {};
        const event = await this.repository.create(POINT_EVENTS, {
            balanceAfter: nextBalance,
            delta: params.delta,
            operatorId: typeof operator.id === 'string' ? operator.id : '',
            operatorRole: typeof operator.role === 'string' ? operator.role : '',
            reason: params.reason,
            remark: typeof params.remark === 'string' ? params.remark : '',
            rewardItemId,
            rewardSnapshot,
            studentId: params.studentId,
            type: params.type,
        });

        return {
            balance: toNumber(updatedAccount.balance),
            event,
            studentId: params.studentId,
        };
    }

    async audit(action, operator, studentId, metadata = {}) {
        if (!this.auditService) {
            return null;
        }
        return this.auditService.record({
            action,
            actor: operator,
            metadata,
            resourceId: studentId,
            resourceType: 'student_points',
        });
    }
}

function assertAdmin(user = {}) {
    if (!user.id || !user.isAdmin) {
        const error = new Error('需要管理员权限');
        error.code = 403;
        throw error;
    }
}

function requireId(value, message) {
    const id = normalizeString(value);
    if (!id) {
        const error = new Error(message);
        error.code = 400;
        throw error;
    }
    return id;
}

function positiveInteger(value, message) {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount <= 0) {
        const error = new Error(message);
        error.code = 400;
        throw error;
    }
    return amount;
}

function pagination(result = {}) {
    return {
        page: toPositivePage(result.page, 1),
        perPage: toPositivePage(result.perPage, 20),
        totalItems: toNumber(result.totalItems),
        totalPages: toNumber(result.totalPages),
    };
}

function toPositivePage(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

module.exports = { PointService };
