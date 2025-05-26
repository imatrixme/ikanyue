/**
 * student/update.js
 *
 * @description :: 更新学生记录
 *
 * 示例请求:
 * POST /v1/student/update
 *
 * 请求体:
 * {
 *   "id": "record_id",          // 必传参数: 学生记录ID
 *   "realname": "张三",         // 非必传参数: 真实姓名
 *   "nickName": "小张",         // 非必传参数: 昵称
 *   "avatar": "https://example.com/avatar.jpg", // 非必传参数: 头像URL
 *   "gender": 1,                // 非必传参数: 性别 (0:未知，1:男，2:女)
 *   "age": 20,                  // 非必传参数: 年龄
 *   "province": "广东省",        // 非必传参数: 省份
 *   "city": "深圳市",            // 非必传参数: 城市
 *   "address": "南山区科技园",    // 非必传参数: 地址
 *   "password": "newpassword"    // 非必传参数: 新密码，如果需要修改
 * }
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');
const md5 = require('licia/md5');

module.exports = async function update(c) {
    const body = await c.req.json();
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

        // 获取请求参数
        const data = { ...body };
        delete data.id; // 从更新数据中移除 id

        // 密码单独处理
        if (data.password) {
            data.password = md5(data.password);
        }

        // 防止修改敏感字段
        delete data.sn;
        delete data.created;
        delete data.updated;
        delete data.blocked; // 只能通过专门的接口修改
        delete data.tokenKey;

        // 头像字段处理
        if (data.avatar !== undefined && (!data.avatar || data.avatar.trim() === '')) {
            data.avatar = process.env.DEFAULT_AVATAR || '';
        }

        // 更新记录
        const [err, student] = await to(pb.collection('students').update(id, data));

        if (err) {
            return c.error(500, err.message || '更新学生信息失败');
        }

        return c.data(student);
    } catch (error) {
        return c.error(500, error.message || '服务器内部错误');
    }
};
