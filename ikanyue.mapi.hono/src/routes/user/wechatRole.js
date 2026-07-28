const pb = require('../../utils/pocketbase');
const { WechatIdentityService } = require('../../services/courseCredits/booking/wechatIdentityService');

function createWechatRoleHandlers(options = {}) {
    const client = options.client || pb;
    const IdentityService = options.IdentityService || WechatIdentityService;
    const service = () => new IdentityService(client);
    return {
        async wechatRoleLoginHandler(c) {
            try {
                const body = await c.req.json();
                return c.data(await service().completeRoleChallenge(c.req, body.challenge, body.role));
            } catch (error) {
                return c.error(error?.code?.includes('UNAVAILABLE') || error?.code?.includes('NOT_VERIFIED') ? 403 : 400,
                    error?.message || '身份选择失败');
            }
        },
        async listWechatRolesHandler(c) {
            try {
                const user = c.get('user');
                return c.data(await service().listRoles(user?.wechatOpenId || ''));
            } catch (error) {
                return c.error(400, error?.message || '获取身份列表失败');
            }
        },
        async switchWechatRoleHandler(c) {
            try {
                const user = c.get('user');
                const body = await c.req.json();
                return c.data(await service().switchRole(c.req, user?.wechatOpenId || '', body.role));
            } catch (error) {
                return c.error(400, error?.message || '切换身份失败');
            }
        },
    };
}

const {
    listWechatRolesHandler,
    switchWechatRoleHandler,
    wechatRoleLoginHandler,
} = createWechatRoleHandlers();

module.exports = {
    createWechatRoleHandlers,
    listWechatRolesHandler,
    switchWechatRoleHandler,
    wechatRoleLoginHandler,
};
