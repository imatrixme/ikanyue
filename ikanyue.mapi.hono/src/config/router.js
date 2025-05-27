// 导入路由模块
const userRoutes = require('../routes/user');
const studentRoutes = require('../routes/student');
const teacherRoutes = require('../routes/teacher');
const activityRoutes = require('../routes/activity');
const videoMaterialRoutes = require('../routes/videoMaterial');
const audioMaterialRoutes = require('../routes/audioMaterial');

const registerBizRoutes = function (routes) {
  // 注册各个模块的路由 - 各模块自行定义完整路径
  userRoutes(routes);
  studentRoutes(routes);
  teacherRoutes(routes);
  activityRoutes(routes);
  videoMaterialRoutes(routes);
  audioMaterialRoutes(routes);
};

module.exports = { registerBizRoutes };
