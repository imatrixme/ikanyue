/**
 * user/update.js
 *
 * @description :: 更新用户信息，根据用户角色更新不同表中的用户信息
 *
 * 示例请求:
 * POST /v1/user/update
 *
 * 请求体:
 * {
 *   "realName": "张三",         // 真实姓名
 *   "nickName": "小张",         // 昵称
 *   "avatar": "https://example.com/avatar.jpg", // 头像URL
 *   "gender": 1,               // 性别 (0:未知，1:男，2:女)
 *   "age": 20,                 // 年龄
 *   "province": "广东省",       // 省份
 *   "city": "深圳市",           // 城市
 *   "address": "南山区科技园",   // 地址
 *   // 其他可更新字段...
 * }
 *
 * 成功响应:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "record_id",
 *     "sn": "unique_sn",
 *     // 其他用户信息字段...
 *   }
 * }
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');

module.exports = async function update(c) {
    // 从JWT token中获取用户信息
    const user = c.get('user');
    if (!user) {
        return c.error(403, '未授权操作，请先登录');
    }

    const userId = user.id;
    const userRole = user.role;

    // 获取要更新的字段
    const body = await c.req.json();
    const updateData = {};
    const allowedFields = [
        'realname',
        'nickname',
        'avatar',
        'gender',
        'age',
        'province',
        'city',
        'address',
        'email',
        'bio',
    ];

    // 检查并添加允许更新的字段
    allowedFields.forEach((field) => {
        const value = body[field];
        if (value !== undefined) {
            updateData[field] = value;
        }
    });

    // 如果没有要更新的字段，返回错误
    if (Object.keys(updateData).length === 0) {
        return c.error(400, '没有提供要更新的字段');
    }

    // 如果头像字段为空，设置默认头像
    if (updateData.avatar !== undefined && (!updateData.avatar || updateData.avatar.trim() === '')) {
        updateData.avatar = process.env.DEFAULT_AVATAR || '';
    }

    try {
        let updatedUser;

        // 根据用户角色确定更新哪个表
        if (userRole === 'student') {
            // 首先检查用户是否存在
            const [checkErr, student] = await to(pb.collection('students').getOne(userId));

            if (checkErr) {
                return c.error(404, '用户不存在或已被删除');
            }

            // 更新学生信息
            const [updateErr, updated] = await to(pb.collection('students').update(userId, updateData));

            if (updateErr) {
                return c.error(500, updateErr.message || '更新学生信息失败');
            }

            updatedUser = updated;
        } else if (userRole === 'teacher') {
            // 首先检查用户是否存在
            const [checkErr, teacher] = await to(pb.collection('teachers').getOne(userId));

            if (checkErr) {
                return c.error(404, '用户不存在或已被删除');
            }

            // 更新教师信息
            const [updateErr, updated] = await to(pb.collection('teachers').update(userId, updateData));

            if (updateErr) {
                return c.error(500, updateErr.message || '更新教师信息失败');
            }

            updatedUser = updated;
        } else {
            return c.error(400, '无效的用户角色');
        }

        // 检查更新后的用户头像是否为空，如果为空则设置默认头像（仅用于返回给前端）
        if (!updatedUser.avatar || updatedUser.avatar.trim() === '') {
            updatedUser.avatar = process.env.DEFAULT_AVATAR || '';
        }

        return c.data(updatedUser);
    } catch (error) {
        return c.error(500, error.message || '服务器内部错误');
    }
};
