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
  // 查询接口 - 无需认证
  routes.post('/v1/videoMaterial/find').handler(videoMaterialFindHandler);
  routes.get('/v1/videoMaterial/find').handler(videoMaterialFindHandler);

  // 创建接口 - 需要教师权限
  routes.post('/v1/videoMaterial/create').use(authMiddleware, isTeacherMiddleware).handler(videoMaterialCreateHandler);

  // 更新接口 - 需要教师权限
  routes.post('/v1/videoMaterial/update').use(authMiddleware, isTeacherMiddleware).handler(videoMaterialUpdateHandler);

  // 删除接口 - 需要管理员权限
  routes
    .post('/v1/videoMaterial/delete')
    .use(authMiddleware, isTeacherMiddleware, isAdminMiddleware)
    .handler(videoMaterialDeleteHandler);
}

module.exports = videoMaterialRoutes;
