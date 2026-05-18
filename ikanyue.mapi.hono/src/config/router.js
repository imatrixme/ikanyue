// 导入路由模块
const userRoutes = require('../routes/user');
const studentRoutes = require('../routes/student');
const teacherRoutes = require('../routes/teacher');
const activityRoutes = require('../routes/activity');
const activitySignupRoutes = require('../routes/activitySignup');
const videoMaterialRoutes = require('../routes/videoMaterial');
const audioMaterialRoutes = require('../routes/audioMaterial');
const attendanceRoutes = require('../routes/attendance');
const lessonRecordRoutes = require('../routes/lessonRecord');
const opsRoutes = require('../routes/ops');

const registerBizRoutes = function (routes) {
    // 注册各个模块的路由 - 各模块自行定义完整路径
    userRoutes(routes);
    studentRoutes(routes);
    teacherRoutes(routes);
    activityRoutes(routes);
    activitySignupRoutes(routes);
    videoMaterialRoutes(routes);
    audioMaterialRoutes(routes);
    attendanceRoutes(routes);
    lessonRecordRoutes(routes);
    opsRoutes(routes);
};

module.exports = { registerBizRoutes };
