/**
 * 音频材料路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 导入处理器
const { audioMaterialFindHandler } = require('./find');
const { audioMaterialCreateHandler } = require('./create');
const { audioMaterialUpdateHandler } = require('./update');
const { audioMaterialDeleteHandler } = require('./delete');

/**
 * 注册音频材料相关路由
 */
function audioMaterialRoutes(routes) {
  // 查询接口 - 无需认证
  routes.get('/v1/audioMaterial/find').handler(audioMaterialFindHandler);

  // 创建接口 - 需要教师权限
  routes.post('/v1/audioMaterial/create').use(authMiddleware, isTeacherMiddleware).handler(audioMaterialCreateHandler);

  // 更新接口 - 需要教师权限
  routes.post('/v1/audioMaterial/update').use(authMiddleware, isTeacherMiddleware).handler(audioMaterialUpdateHandler);

  // 删除接口 - 需要管理员权限
  routes
    .post('/v1/audioMaterial/delete')
    .use(authMiddleware, isTeacherMiddleware, isAdminMiddleware)
    .handler(audioMaterialDeleteHandler);
}

module.exports = audioMaterialRoutes;
