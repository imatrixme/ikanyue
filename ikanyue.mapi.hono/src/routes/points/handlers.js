function createPointHandlers(services = createDefaultPointServices()) {
    return {
        async myPoints(c) {
            return safe(c, async () => {
                const user = c.get('user');
                requireStudent(user);
                return services.pointService.getStudentSummary(user.id, c.req.query());
            });
        },

        async rewardItems(c) {
            return safe(c, async () => {
                const user = c.get('user');
                requireStudent(user);
                const summary = await services.pointService.getStudentSummary(user.id, { perPage: 5 });
                return services.rewardService.availability(summary.balance);
            });
        },
    };
}

async function safe(c, operation) {
    try {
        return c.data(await operation());
    } catch (error) {
        return c.error(error.code || error.status || 500, error.message || '服务器内部错误');
    }
}

function requireStudent(user = {}) {
    if (!user.id || user.role !== 'student') {
        const error = new Error('仅学员可访问积分');
        error.code = 403;
        throw error;
    }
}

function createDefaultPointServices() {
    const { OpsRepository } = require('../../services/ops/opsRepository');
    const { createPointServices } = require('../../services/points');
    return createPointServices(new OpsRepository());
}

module.exports = { createPointHandlers };
