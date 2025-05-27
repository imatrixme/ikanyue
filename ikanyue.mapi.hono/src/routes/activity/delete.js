/**
 * 活动删除接口
 * 删除指定活动，需要管理员权限
 * 对应原项目: api/controllers/activity/delete.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 活动删除处理器
 * @param {Object} c - Hono 上下文对象
 */
async function activityDeleteHandler(c) {
  const body = await c.req.parseBody();
  const { id } = body;

  // ID必填验证
  if (!id || !id.trim()) {
    return c.error(400, '活动ID不能为空');
  }

  try {
    // 检查活动是否存在
    const [checkErr, existingActivity] = await to(pb.collection('activities').getOne(id.trim()));

    if (checkErr) {
      if (checkErr.status === 404) {
        return c.error(404, '活动不存在');
      }
      console.error('活动查询失败:', checkErr);
      return c.error(500, '查询失败，请稍后重试');
    }

    // 删除活动记录
    const [err, success] = await to(pb.collection('activities').delete(id.trim()));

    if (err) {
      console.error('活动删除失败:', err);
      return c.error(500, '删除失败，请稍后重试');
    }

    return c.data({ success: true, message: '活动删除成功' }, '活动删除成功');
  } catch (error) {
    console.error('活动删除异常:', error);
    return c.error(500, '服务器内部错误');
  }
}

module.exports = { activityDeleteHandler };
