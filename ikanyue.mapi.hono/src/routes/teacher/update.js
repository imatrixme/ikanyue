/**
 * teacher/update.js
 *
 * @description :: 更新教师记录
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');
const md5 = require('licia/md5');

async function teacherUpdateHandler(c) {
    const body = await c.req.json();
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
        delete data.verified; // 只能通过专门的接口修改
        delete data.verifiedAt;
        delete data.verifiedBy;
        delete data.isAdmin; // 只能通过专门的接口修改
        delete data.tokenKey;

        // 头像字段处理
        if (data.avatar !== undefined && (!data.avatar || data.avatar.trim() === '')) {
            data.avatar = process.env.DEFAULT_AVATAR || '';
        }

        // 更新记录
        const [err, teacher] = await to(pb.collection('teachers').update(id, data));

        if (err) {
            return c.error(500, err.message || '更新教师信息失败');
        }

        return c.data(teacher);
    } catch (error) {
        return c.error(500, error.message || '服务器内部错误');
    }
}

module.exports = { teacherUpdateHandler };
