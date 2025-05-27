/**
 * user/login.js
 *
 * @description :: 统一登录接口，先尝试学生登录，失败则尝试教师登录，都找不到则自动注册学生用户
 *
 * 示例请求:
 * POST /v1/user/login
 *
 * 请求体:
 * {
 *   "cellphone": "13800138000",  // 必传参数: 手机号
 *   "password": "yourpassword"    // 必传参数: 密码
 * }
 *
 * 成功响应:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "record_id",
 *     "sn": "unique_sn",
 *     "cellphone": "13800138000",
 *     "role": "student|teacher",  // 角色标识
 *     // 其他用户信息...
 *     "token": "jwt_token"  // JWT 令牌
 *   }
 * }
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');
const md5 = require('licia/md5');
const { jwtAuth } = require('../../utils/jwtAuth');
const uuid = require('licia/uuid');

async function userLoginHandler(c) {
  const body = await c.req.json();
  const cellphone = body.cellphone || '';
  const password = body.password || '';

  if (!cellphone || !password) {
    return c.error(400, '手机号和密码不能为空');
  }

  try {
    // 先尝试查询学生记录
    const students = await pb.collection('students').getList(1, 1, {
      filter: `cellphone="${cellphone}"`,
    });

    // 如果找到学生记录
    if (students.items.length > 0) {
      const student = students.items[0];

      // 验证密码
      if (student.password !== md5(password)) {
        return c.error(401, '手机号或密码错误');
      }

      // 如果账户被封禁
      if (student.blocked) {
        return c.error(403, '该账号已被封禁，请联系客服');
      }

      // 更新登录信息
      const updateData = {
        lastLoginAt: new Date().toISOString(),
        lastLoginIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
        lastLoginMethod: 'password',
      };

      const [updateErr, updatedStudent] = await to(pb.collection('students').update(student.id, updateData));
      if (updateErr) {
        console.error('更新学生登录信息失败:', updateErr);
        // 即使更新失败也继续登录流程
      }

      // 使用更新后的数据或原数据
      const studentData = updatedStudent || student;

      // 检查头像是否为空，如果为空则设置默认头像
      if (!studentData.avatar || studentData.avatar.trim() === '') {
        studentData.avatar = process.env.DEFAULT_AVATAR || 'https://example.com/default-avatar.png';
      }

      // 修复字段名不一致问题
      if (studentData.idAdmin !== undefined) {
        studentData.isAdmin = studentData.idAdmin;
        delete studentData.idAdmin;
      } else {
        studentData.isAdmin = false;
      }

      // 生成 JWT token，指定角色为 student
      studentData.token = jwtAuth.sign(c.req, studentData.id, studentData.sn, 'student', false);
      studentData.role = 'student';

      return c.data(studentData);
    }

    // 如果没有找到学生记录，尝试查询教师记录
    const teachers = await pb.collection('teachers').getList(1, 1, {
      filter: `cellphone="${cellphone}"`,
    });

    // 如果找到教师记录
    if (teachers.items.length > 0) {
      const teacher = teachers.items[0];

      // 验证密码
      if (teacher.password !== md5(password)) {
        return c.error(401, '手机号或密码错误');
      }

      // 如果账户被封禁
      if (teacher.blocked) {
        return c.error(403, '该账号已被封禁，请联系客服');
      }

      // 如果账户未审核
      if (!teacher.verified) {
        return c.error(403, '账号正在审核中，请耐心等待');
      }

      // 更新登录信息
      const updateData = {
        lastLoginAt: new Date().toISOString(),
        lastLoginIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
        lastLoginMethod: 'password',
      };

      const [updateErr, updatedTeacher] = await to(pb.collection('teachers').update(teacher.id, updateData));
      if (updateErr) {
        console.error('更新教师登录信息失败:', updateErr);
        // 即使更新失败也继续登录流程
      }

      // 使用更新后的数据或原数据
      const teacherData = updatedTeacher || teacher;

      // 检查头像是否为空，如果为空则设置默认头像
      if (!teacherData.avatar || teacherData.avatar.trim() === '') {
        teacherData.avatar = process.env.DEFAULT_AVATAR || 'https://example.com/default-avatar.png';
      }

      // 修复字段名不一致问题
      let isAdmin;
      if (teacherData.idAdmin !== undefined) {
        isAdmin = teacherData.idAdmin;
        teacherData.isAdmin = teacherData.idAdmin;
        delete teacherData.idAdmin;
      } else {
        isAdmin = teacherData.isAdmin || false;
      }

      // 生成 JWT token，指定角色为 teacher
      teacherData.token = jwtAuth.sign(c.req, teacherData.id, teacherData.sn, 'teacher', isAdmin);
      teacherData.role = 'teacher';
      teacherData.isAdmin = isAdmin;

      return c.data(teacherData);
    }

    // 如果既没有找到学生也没有找到教师记录，自动创建一个学生用户
    const studentData = {
      cellphone: cellphone,
      password: md5(password),
      tokenKey: uuid(),
      sn: uuid(),
      nickName: `用户${cellphone.substring(cellphone.length - 4)}`,
      gender: 0,
      blocked: false,
      avatar: process.env.DEFAULT_AVATAR || '', // 为新用户设置默认头像
      lastLoginAt: new Date().toISOString(),
      lastLoginIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      lastLoginMethod: 'password',
    };

    console.log('studentData', studentData);
    // 创建学生记录
    const [createErr, newStudent] = await to(pb.collection('students').create(studentData));

    if (createErr) {
      return c.error(500, createErr.message || '创建学生失败');
    }

    // 生成 JWT token
    newStudent.token = jwtAuth.sign(c.req, newStudent.id, newStudent.sn, 'student', false);
    newStudent.role = 'student';
    newStudent.isAdmin = false;

    return c.data(newStudent);
  } catch (error) {
    return c.error(500, error.message || '服务器内部错误');
  }
}

module.exports = { userLoginHandler };
