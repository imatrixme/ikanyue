/**
 * 音频材料管理路由
 * 对应原项目: api/controllers/audioMaterial/
 */

const { audioMaterialFindHandler } = require('./find');
const { audioMaterialCreateHandler } = require('./create');
const { audioMaterialUpdateHandler } = require('./update');
const { audioMaterialDeleteHandler } = require('./delete');

/**
 * 注册音频材料相关路由
 * @param {*} app Hono 应用实例
 * @param {*} authMiddleware 认证中间件
 * @param {*} isTeacherMiddleware 教师权限中间件
 */
function audioMaterialRoutes(app, authMiddleware, isTeacherMiddleware) {
    // 音频材料查询接口
    app.post('/v1/audioMaterial/find', authMiddleware, audioMaterialFindHandler);

    // 音频材料创建接口 (需要教师权限)
    app.post('/v1/audioMaterial/create', authMiddleware, isTeacherMiddleware(), audioMaterialCreateHandler);

    // 音频材料更新接口 (需要教师权限)
    app.post('/v1/audioMaterial/update', authMiddleware, isTeacherMiddleware(), audioMaterialUpdateHandler);

    // 音频材料删除接口 (需要教师权限)
    app.post('/v1/audioMaterial/delete', authMiddleware, isTeacherMiddleware(), audioMaterialDeleteHandler);
}

module.exports = audioMaterialRoutes;
