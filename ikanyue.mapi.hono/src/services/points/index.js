const { PointService } = require('./pointService');
const { RewardService } = require('./rewardService');

function createPointServices(repository, auditService = null) {
    const rewardService = new RewardService(repository);
    const pointService = new PointService(repository, auditService);
    return {
        pointService,
        rewardService,
    };
}

module.exports = { createPointServices, PointService, RewardService };
