/**
 * 视频材料路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 导入处理器
const { videoMaterialFindHandler } = require('./find');
const { videoMaterialCreateHandler } = require('./create');
const { videoMaterialUpdateHandler } = require('./update');
const { videoMaterialDeleteHandler } = require('./delete');

/**
 * 注册视频材料相关路由
 */
function videoMaterialRoutes(routes) {
    routes.use(authMiddleware, isTeacherMiddleware).group('/v1/material/video', (video) => {
        video.post('/find').handler(videoMaterialFindHandler);
        video.post('/create').handler(videoMaterialCreateHandler);
        video.post('/update').handler(videoMaterialUpdateHandler);
        video.use(isAdminMiddleware).post('/delete').handler(videoMaterialDeleteHandler);
    });
}

module.exports = videoMaterialRoutes;
