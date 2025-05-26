/**
 * 视频材料管理路由
 * 对应原项目: api/controllers/videoMaterial/
 */

const { videoMaterialFindHandler } = require('./find');
const { videoMaterialCreateHandler } = require('./create');
const { videoMaterialUpdateHandler } = require('./update');
const { videoMaterialDeleteHandler } = require('./delete');

/**
 * 注册视频材料相关路由
 * @param {*} app Hono 应用实例
 * @param {*} authMiddleware 认证中间件
 * @param {*} isTeacherMiddleware 教师权限中间件
 */
function videoMaterialRoutes(app, authMiddleware, isTeacherMiddleware) {
    // 视频材料查询接口
    app.post('/v1/videoMaterial/find', authMiddleware, videoMaterialFindHandler);

    // 视频材料创建接口 (需要教师权限)
    app.post('/v1/videoMaterial/create', authMiddleware, isTeacherMiddleware(), videoMaterialCreateHandler);

    // 视频材料更新接口 (需要教师权限)
    app.post('/v1/videoMaterial/update', authMiddleware, isTeacherMiddleware(), videoMaterialUpdateHandler);

    // 视频材料删除接口 (需要教师权限)
    app.post('/v1/videoMaterial/delete', authMiddleware, isTeacherMiddleware(), videoMaterialDeleteHandler);
}

module.exports = videoMaterialRoutes;
