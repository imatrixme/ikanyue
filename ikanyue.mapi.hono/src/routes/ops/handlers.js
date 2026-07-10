const { readRequestBody } = require('../../services/ops/opsUtils');

function createOpsHandlers(services = createDefaultOpsServices()) {
    return {
        async login(c) {
            const body = await readRequestBody(c);
            return sendResult(c, await services.authService.login(body, c.req));
        },

        async register(c) {
            const body = await readRequestBody(c);
            return sendResult(c, await services.authService.register(body, c.req));
        },

        async me(c) {
            return sendResult(c, await services.authService.me(c.get('user')));
        },

        async changePassword(c) {
            const body = await readRequestBody(c);
            return sendResult(c, await services.authService.changePassword(c.get('user'), body, c.req));
        },

        async listStudents(c) {
            return safe(c, () => services.pointService.listStudentBalances(c.req.query()));
        },

        async studentPoints(c) {
            return safe(c, () => services.pointService.getStudentSummary(c.req.param('studentId'), c.req.query()));
        },

        async addStudentPoints(c) {
            const body = await readRequestBody(c);
            return safe(c, () => services.pointService.addPoints(c.get('user'), {
                ...body,
                studentId: c.req.param('studentId'),
            }));
        },

        async offlineRedeem(c) {
            const body = await readRequestBody(c);
            return safe(c, () => services.pointService.offlineRedeem(c.get('user'), body, services.rewardService));
        },

        async listRewards(c) {
            return safe(c, () => services.rewardService.listForAdmin(c.get('user'), c.req.query()));
        },

        async createReward(c) {
            const body = await readRequestBody(c);
            return safe(c, () => services.rewardService.create(c.get('user'), body));
        },

        async updateReward(c) {
            const body = await readRequestBody(c);
            return safe(c, () => services.rewardService.update(c.get('user'), c.req.param('id'), body));
        },

        async uploadRewardImage(c) {
            return safe(c, async () => {
                let body;
                try {
                    body = await c.req.parseBody();
                } catch {
                    const error = new Error('图片上传请求解析失败');
                    error.code = 400;
                    throw error;
                }
                return services.rewardService.uploadImage(
                    c.get('user'),
                    c.req.param('id'),
                    body.imageFile || body.image || body.file
                );
            });
        },
    };
}

async function safe(c, operation) {
    try {
        return c.data(await operation());
    } catch (error) {
        return sendError(c, error);
    }
}

function sendResult(c, result) {
    if (!result?.ok) {
        return c.error(result?.code || 500, result?.message || '操作失败');
    }
    return c.data(result.data);
}

function sendError(c, error) {
    return c.error(error.code || error.status || 500, error.message || '服务器内部错误');
}

function createDefaultOpsServices() {
    const { createOpsServices } = require('../../services/ops');
    return createOpsServices();
}

module.exports = { createOpsHandlers };
