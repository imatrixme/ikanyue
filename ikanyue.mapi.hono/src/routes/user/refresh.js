/**
 * user/refresh.js
 *
 * @description :: 刷新用户信息和令牌
 *
 * 示例请求:
 * POST /v1/user/refresh
 *
 * 请求体:
 * 不需要请求体，用户信息从JWT令牌中获取
 *
 * 成功响应:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "record_id",
 *     "sn": "unique_sn",
 *     "role": "student|teacher",
 *     // 其他用户信息...
 *     "token": "jwt_token"  // 新的JWT令牌
 *   }
 * }
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');
const { jwtAuth } = require('../../utils/jwtAuth');
const { getFileUrl } = require('../../utils/fileUrl');

async function userRefreshHandler(c) {
    // 从JWT令牌中获取用户信息
    const user = c.get('user');
    if (!user) {
        return c.error(403, '未授权操作，请先登录');
    }

    const userId = user.id;
    const userSn = user.sn;
    const userRole = user.role;
    try {
        let userData;

        // 根据用户角色确定获取哪个表的数据
        if (userRole === 'student') {
            // 获取学生信息
            const [err, student] = await to(pb.collection('students').getOne(userId));

            if (err) {
                return c.error(404, '用户不存在或已被删除');
            }

            // 如果账户被封禁
            if (student.blocked) {
                return c.error(403, '该账号已被封禁，请联系客服');
            }

            // 更新登录信息
            const updateData = {
                lastLoginAt: new Date().toISOString(),
                lastLoginIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
                lastLoginMethod: 'refresh',
            };

            await pb.collection('students').update(userId, updateData);

            const avatarFile =
                (Array.isArray(student.avatarFile) && student.avatarFile[0]) ||
                student.avatarFile ||
                student.avatar ||
                '';
            const avatarUrl = getFileUrl(student, avatarFile) || avatarFile || student.avatar || process.env.DEFAULT_AVATAR || '';
            student.avatar = avatarFile || student.avatar || process.env.DEFAULT_AVATAR || '';
            student.avatarUrl = avatarUrl;

            // 生成新的JWT令牌
            student.token = jwtAuth.sign(c.req, userId, userSn, 'student', false);
            student.role = 'student';
            student.isAdmin = false;

            userData = student;
        } else if (userRole === 'teacher') {
            // 获取教师信息
            const [err, teacher] = await to(pb.collection('teachers').getOne(userId));

            if (err) {
                return c.error(404, '用户不存在或已被删除');
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
                lastLoginMethod: 'refresh',
            };

            await pb.collection('teachers').update(userId, updateData);

            const avatarFile =
                (Array.isArray(teacher.avatarFile) && teacher.avatarFile[0]) ||
                teacher.avatarFile ||
                teacher.avatar ||
                '';
            const avatarUrl = getFileUrl(teacher, avatarFile) || avatarFile || teacher.avatar || process.env.DEFAULT_AVATAR || '';
            teacher.avatar = avatarFile || teacher.avatar || process.env.DEFAULT_AVATAR || '';
            teacher.avatarUrl = avatarUrl;

            // 检查是否为管理员
            const currentIsAdmin = teacher.isAdmin || false;

            // 生成新的JWT令牌
            teacher.token = jwtAuth.sign(c.req, userId, userSn, 'teacher', currentIsAdmin);
            teacher.role = 'teacher';
            teacher.isAdmin = currentIsAdmin;

            userData = teacher;
        } else {
            return c.error(400, '无效的用户角色');
        }

        return c.data(userData);
    } catch (error) {
        console.error('刷新用户信息失败:', error);
        return c.error(500, '服务器内部错误');
    }
}

module.exports = { userRefreshHandler };
