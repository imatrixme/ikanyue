/**
 * 音频材料路由模块 - 使用通用路由构建器
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 尝试导入真实处理器，如果不存在则使用临时处理器
let audioMaterialFindHandler, audioMaterialCreateHandler, audioMaterialUpdateHandler, audioMaterialDeleteHandler;

try {
    ({ audioMaterialFindHandler } = require('./find'));
} catch (e) {
    audioMaterialFindHandler = (c) =>
        c.json({ message: 'Audio material find - handler not implemented', path: c.req.path });
}

try {
    ({ audioMaterialCreateHandler } = require('./create'));
} catch (e) {
    audioMaterialCreateHandler = (c) =>
        c.json({ message: 'Audio material create - handler not implemented', path: c.req.path });
}

try {
    ({ audioMaterialUpdateHandler } = require('./update'));
} catch (e) {
    audioMaterialUpdateHandler = (c) =>
        c.json({ message: 'Audio material update - handler not implemented', path: c.req.path });
}

try {
    ({ audioMaterialDeleteHandler } = require('./delete'));
} catch (e) {
    audioMaterialDeleteHandler = (c) =>
        c.json({ message: 'Audio material delete - handler not implemented', path: c.req.path });
}

/**
 * 注册音频材料相关路由
 * @param {*} routes 路由构建器实例
 */
function audioMaterialRoutes(routes) {
    // 音频材料路由组 - 需要认证和教师权限
    routes.use(authMiddleware, isTeacherMiddleware).group('/material/audio', (audio) => {
        // 基础操作 - 教师权限
        audio.post('/find').handler(audioMaterialFindHandler);
        audio.post('/create').handler(audioMaterialCreateHandler);
        audio.post('/update').handler(audioMaterialUpdateHandler);

        // 删除需要管理员权限
        audio.use(isAdminMiddleware).post('/delete').handler(audioMaterialDeleteHandler);
    });
}

module.exports = audioMaterialRoutes;
