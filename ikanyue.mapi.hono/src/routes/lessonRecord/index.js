/**
 * 上课记录路由模块
 */

const { authMiddleware } = require('../../middleware/auth');
const { lessonRecordFindHandler } = require('./find');
const { lessonRecordDetailHandler } = require('./detail');

function lessonRecordRoutes(routes) {
    routes.use(authMiddleware).group('/v1/lesson-record', (lessonRecord) => {
        lessonRecord.get('/find').handler(lessonRecordFindHandler);
        lessonRecord.get('/detail').handler(lessonRecordDetailHandler);
        lessonRecord.get('/:id').handler(lessonRecordDetailHandler);
    });
}

module.exports = lessonRecordRoutes;
