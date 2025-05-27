/**
 * teacher/delete.js
 *
 * @description :: 删除教师记录
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');

async function teacherDeleteHandler(c) {
  const body = await c.req.parseBody();
  const id = body.id;

  if (!id) {
    return c.error(400, '缺少教师ID');
  }

  try {
    // 先检查记录是否存在
    const [checkErr, existingTeacher] = await to(pb.getOne('teachers', id));

    if (checkErr) {
      return c.error(404, '教师不存在');
    }

    // 删除记录
    const [err, success] = await to(pb.collection('teachers').delete(id));

    if (err) {
      return c.error(500, err.message || '删除教师失败');
    }

    return c.data({ success: true, message: '教师已成功删除' });
  } catch (error) {
    return c.error(500, error.message || '服务器内部错误');
  }
}

module.exports = { teacherDeleteHandler };
