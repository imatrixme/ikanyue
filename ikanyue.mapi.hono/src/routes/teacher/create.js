/**
 * teacher/create.js
 *
 * @description :: 创建教师记录
 *
 * 示例请求:
 * POST /v1/teacher/create
 *
 * 请求体:
 * {
 *   "cellphone": "13800138000", // 必传参数: 手机号
 *   "password": "yourpassword", // 必传参数: 密码
 *   "realname": "李老师",       // 非必传参数: 真实姓名
 *   "nickName": "小李",         // 非必传参数: 昵称
 *   "avatar": "https://example.com/avatar.jpg", // 非必传参数: 头像URL
 *   "gender": 1,               // 非必传参数: 性别 (0:未知，1:男，2:女)，默认 0
 *   "age": 30,                 // 非必传参数: 年龄
 *   "province": "广东省",       // 非必传参数: 省份
 *   "city": "深圳市",           // 非必传参数: 城市
 *   "address": "南山区科技园",   // 非必传参数: 地址
 *   "hours": 0                 // 非必传参数: 课时，默认 0
 * }
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');
const uuid = require('licia/uuid');
const md5 = require('licia/md5');
const { jwtAuth } = require('../../utils/jwtAuth');

async function teacherCreateHandler(c) {
  // 获取请求参数
  const body = await c.req.parseBody();
  const data = { ...body };

  // 检查必要字段
  if (!data.cellphone || !data.password) {
    return c.error(400, '缺少必要信息（手机号、密码）');
  }

  try {
    // 检查手机号是否已存在
    const existingTeachers = await pb.collection('teachers').getList(1, 1, {
      filter: `cellphone="${data.cellphone}"`,
    });

    if (existingTeachers.items.length > 0) {
      return c.error(409, '手机号已注册');
    }

    // 添加基本信息
    data.sn = uuid();
    data.password = md5(data.password); // 密码加密
    data.hours = data.hours || 0;
    data.blocked = false;
    data.gender = data.gender || 0;
    data.verified = false; // 教师需要审核
    data.verifiedAt = null;
    data.verifiedBy = null;
    data.isAdmin = false;
    data.tokenKey = uuid();

    // 设置默认头像
    if (!data.avatar || data.avatar.trim() === '') {
      data.avatar = process.env.DEFAULT_AVATAR || '';
    }

    // 创建教师记录
    const [err, teacher] = await to(pb.collection('teachers').create(data));

    if (err) {
      console.error('创建教师失败:', err);
      return c.error(500, err.message || '创建教师失败');
    }

    // 生成 JWT token
    teacher.token = jwtAuth.sign(c.req, teacher.id, teacher.sn, 'teacher', false);
    teacher.role = 'teacher';

    return c.data(teacher);
  } catch (error) {
    return c.error(500, error.message || '服务器内部错误');
  }
}

module.exports = { teacherCreateHandler };
