/**
 * 视频材料路由模块 - 使用通用路由构建器
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 尝试导入真实处理器，如果不存在则使用临时处理器
let videoMaterialFindHandler, videoMaterialCreateHandler, videoMaterialUpdateHandler, videoMaterialDeleteHandler;

try {
    ({ videoMaterialFindHandler } = require('./find'));
} catch (e) {
    videoMaterialFindHandler = (c) =>
        c.json({ message: 'Video material find - handler not implemented', path: c.req.path });
}

try {
    ({ videoMaterialCreateHandler } = require('./create'));
} catch (e) {
    videoMaterialCreateHandler = (c) =>
        c.json({ message: 'Video material create - handler not implemented', path: c.req.path });
}

try {
    ({ videoMaterialUpdateHandler } = require('./update'));
} catch (e) {
    videoMaterialUpdateHandler = (c) =>
        c.json({ message: 'Video material update - handler not implemented', path: c.req.path });
}

try {
    ({ videoMaterialDeleteHandler } = require('./delete'));
} catch (e) {
    videoMaterialDeleteHandler = (c) =>
        c.json({ message: 'Video material delete - handler not implemented', path: c.req.path });
}

/**
 * 注册视频材料相关路由
 * @param {*} routes 路由构建器实例
 */
function videoMaterialRoutes(routes) {
    // 视频材料路由组 - 需要认证和教师权限
    routes.use(authMiddleware, isTeacherMiddleware).group('/material/video', (video) => {
        // 基础操作 - 教师权限
        video.post('/find').handler(videoMaterialFindHandler);
        video.post('/create').handler(videoMaterialCreateHandler);
        video.post('/update').handler(videoMaterialUpdateHandler);

        // 删除需要管理员权限
        video.use(isAdminMiddleware).post('/delete').handler(videoMaterialDeleteHandler);
    });
}

module.exports = videoMaterialRoutes;
