/**
 * student/find.js
 *
 * @description :: 查询学生记录
 *
 * 示例请求 1 (查询单个学生):
 * POST /v1/student/find
 * {
 *   "id": "student_id"
 * }
 *
 * 示例请求 2 (查询学生列表):
 * POST /v1/student/find
 * {
 *   "page": 1,
 *   "limit": 20,
 *   "query": "搜索关键词"
 * }
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');

/**
 * 学生查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function studentFindHandler(c) {
  const query = c.req.query();
  const { page = 1, limit = 10, cellphone = '', nickName = '' } = query;

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

    const filter = filters.length > 0 ? filters.join(' && ') : '';

    // 查询学生列表
    const [err, result] = await to(
      pb.collection('students').getList(page, limit, {
        filter: filter,
        sort: '-created',
        fields: 'id,sn,cellphone,nickName,avatar,realName,gender,birthday,blocked,lastLoginAt,created,updated',
      })
    );

    if (err) {
      console.error('学生查询失败:', err);
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
    console.error('学生查询异常:', error);
    return c.error(500, '服务器内部错误');
  }
}

module.exports = { studentFindHandler };
