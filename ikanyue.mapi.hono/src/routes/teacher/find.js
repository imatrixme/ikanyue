/**
 * 教师查询接口
 * 分页查询教师列表，支持按手机号、昵称搜索，需要管理员权限
 * 对应原项目: api/controllers/teacher/find.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 教师查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function teacherFindHandler(c) {
    const body = await c.req.json();
    const { page = 1, limit = 10, cellphone = '', nickName = '', verified = null } = body;

    // 参数验证
    if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
        return c.error(400, '页码和每页数量必须为正整数');
    }

    if (limit > 100) {
        return c.error(400, '每页数量不能超过100');
    }

    try {
        // 构建查询条件
        let filters = [];

        if (cellphone.trim()) {
            filters.push(`cellphone ~ "${cellphone.trim()}"`);
        }

        if (nickName.trim()) {
            filters.push(`nickName ~ "${nickName.trim()}"`);
        }

        // 审核状态过滤
        if (verified !== null && verified !== undefined) {
            filters.push(`verified = ${verified ? 'true' : 'false'}`);
        }

        const filter = filters.length > 0 ? filters.join(' && ') : '';

        // 查询教师列表
        const [err, result] = await to(
            pb.collection('teachers').getList(page, limit, {
                filter: filter,
                sort: '-created',
                fields: 'id,sn,cellphone,nickName,avatar,realName,gender,birthday,blocked,verified,isAdmin,lastLoginAt,created,updated',
            })
        );

        if (err) {
            console.error('教师查询失败:', err);
            return c.error(500, '查询失败，请稍后重试');
        }

        return c.data(
            {
                items: result.items,
                totalItems: result.totalItems,
                totalPages: result.totalPages,
                page: result.page,
                perPage: result.perPage,
            },
            '查询成功'
        );
    } catch (error) {
        console.error('教师查询异常:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { teacherFindHandler };
