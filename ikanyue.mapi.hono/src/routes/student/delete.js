/**
 * student/delete.js
 *
 * @description :: 删除学生记录
 *
 * 示例请求:
 * POST /v1/student/delete
 *
 * 请求体:
 * {
 *   "id": "record_id"  // 必传参数: 学生记录ID
 * }
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');

module.exports = async function deleteStudent(c) {
  const body = await c.req.parseBody();
  const id = body.id;

  if (!id) {
    return c.error(400, '缺少学生ID');
  }

  try {
    // 先检查记录是否存在
    const [checkErr, existingStudent] = await to(pb.getOne('students', id));

    if (checkErr) {
      return c.error(404, '学生不存在');
    }

    // 删除记录
    const [err, success] = await to(pb.collection('students').delete(id));

    if (err) {
      return c.error(500, err.message || '删除学生失败');
    }

    return c.data({ success: true, message: '学生已成功删除' });
  } catch (error) {
    return c.error(500, error.message || '服务器内部错误');
  }
};
