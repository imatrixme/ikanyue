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
  routes.group('/v1/material/audio', (audio) => {
    audio.get('/find').handler(audioMaterialFindHandler);

    audio.use(authMiddleware, isTeacherMiddleware).group('', (audio) => {
      audio.post('/create').handler(audioMaterialCreateHandler);
      audio.post('/update').handler(audioMaterialUpdateHandler);
      audio.use(isAdminMiddleware).post('/delete').handler(audioMaterialDeleteHandler);
    });
  });
}

module.exports = audioMaterialRoutes;
