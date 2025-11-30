/**
 * 签到记录路由模块
 */

const { authMiddleware } = require('../../middleware/auth');
const { attendanceFindHandler } = require('./find');
const { attendanceDetailHandler } = require('./detail');
const { attendanceCreateHandler } = require('./create');

function attendanceRoutes(routes) {
    routes.use(authMiddleware).group('/v1/attendance', (attendance) => {
        attendance.get('/find').handler(attendanceFindHandler);
        attendance.get('/detail').handler(attendanceDetailHandler);
        attendance.get('/:id').handler(attendanceDetailHandler);
        attendance.post('/').handler(attendanceCreateHandler);
    });
}

module.exports = attendanceRoutes;
