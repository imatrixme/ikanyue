/**
 * user/login.js
 *
 * @description :: 统一登录接口，先尝试学生登录，失败则尝试教师登录；未注册的手机号不会自动建号（新用户走微信登录）
 *
 * 示例请求:
 * POST /v1/user/login
 *
 * 请求体 (application/json 或 application/x-www-form-urlencoded):
 * { "cellphone": "13800138000", "password": "yourpassword" }
 *
 * 参数说明:
 * - cellphone: 手机号 (必传)
 * - password: 密码 (必传)
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
const { filterLiteral, publicUser } = require('../../utils/publicUser');
const { getFileUrl } = require('../../utils/fileUrl');
const { authenticatePocketBaseTeacher } = require('../../services/ops/pocketbaseTeacherAuth');

async function matchesTeacherPassword(teacher, password, cellphone, authenticator = authenticatePocketBaseTeacher) {
    if (teacher.password) {
        return teacher.password === md5(password);
    }
    return authenticator(teacher, password, cellphone);
}

const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
const failures = new Map();

// Per-account throttle against password guessing; process-local, which is enough for a single API instance.
function throttled(cellphone, now = Date.now()) {
    const entry = failures.get(cellphone);
    if (entry && now - entry.since > FAILURE_WINDOW_MS) failures.delete(cellphone);
    return (failures.get(cellphone)?.count || 0) >= FAILURE_LIMIT;
}

function recordFailure(cellphone, now = Date.now()) {
    const entry = failures.get(cellphone) || { count: 0, since: now };
    entry.count += 1;
    failures.set(cellphone, entry);
    if (failures.size > 10_000) failures.delete(failures.keys().next().value);
}

function rejectCredentials(c, cellphone) {
    recordFailure(cellphone);
    return c.error(401, '手机号或密码错误');
}

async function userLoginHandler(c) {
    const contentType = c.req.header('content-type') || '';
    const body = contentType.includes('application/json') ? await c.req.json() : await c.req.parseBody();
    const cellphone = body.cellphone || '';
    const password = body.password || '';

    if (!cellphone || !password) {
        return c.error(400, '手机号和密码不能为空');
    }
    if (throttled(cellphone)) {
        return c.error(429, '登录尝试次数过多，请 15 分钟后再试');
    }

    try {
    // 先尝试查询学生记录
        const students = await pb.collection('students').getList(1, 1, {
            filter: `cellphone=${filterLiteral(cellphone)}`,
        });

        // 如果找到学生记录
        if (students.items.length > 0) {
            const student = students.items[0];

            // 验证密码
            if (!student.password || student.password !== md5(password)) {
                return rejectCredentials(c, cellphone);
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
            const studentAvatarFile =
                (Array.isArray(studentData.avatarFile) && studentData.avatarFile[0]) ||
                studentData.avatarFile ||
                studentData.avatar ||
                '';
            const studentAvatarUrl =
                getFileUrl(studentData, studentAvatarFile) ||
                studentAvatarFile ||
                studentData.avatar ||
                process.env.DEFAULT_AVATAR ||
                'https://example.com/default-avatar.png';
            studentData.avatar = studentAvatarFile || studentData.avatar || process.env.DEFAULT_AVATAR || 'https://example.com/default-avatar.png';
            studentData.avatarUrl = studentAvatarUrl;

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

            failures.delete(cellphone);
            return c.data(publicUser(studentData));
        }

        // 如果没有找到学生记录，尝试查询教师记录
        const teachers = await pb.collection('teachers').getList(1, 1, {
            filter: `cellphone=${filterLiteral(cellphone)}`,
        });

        // 如果找到教师记录
        if (teachers.items.length > 0) {
            const teacher = teachers.items[0];

            // 验证密码
            if (!(await matchesTeacherPassword(teacher, password, cellphone))) {
                return rejectCredentials(c, cellphone);
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
            const teacherAvatarFile =
                (Array.isArray(teacherData.avatarFile) && teacherData.avatarFile[0]) ||
                teacherData.avatarFile ||
                teacherData.avatar ||
                '';
            const teacherAvatarUrl =
                getFileUrl(teacherData, teacherAvatarFile) ||
                teacherAvatarFile ||
                teacherData.avatar ||
                process.env.DEFAULT_AVATAR ||
                'https://example.com/default-avatar.png';
            teacherData.avatar = teacherAvatarFile || teacherData.avatar || process.env.DEFAULT_AVATAR || 'https://example.com/default-avatar.png';
            teacherData.avatarUrl = teacherAvatarUrl;

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
            teacherData.token = jwtAuth.sign(c.req, teacherData.id, teacherData.sn, 'teacher', isAdmin, {
                courseCreditCapabilities: Array.isArray(teacherData.courseCreditCapabilities)
                    ? teacherData.courseCreditCapabilities
                    : [],
            });
            teacherData.role = 'teacher';
            teacherData.isAdmin = isAdmin;

            failures.delete(cellphone);
            return c.data(publicUser(teacherData));
        }

        // 未注册的手机号不自动建号，避免他人抢占手机号；返回与密码错误相同的提示，不暴露账号是否存在。
        return rejectCredentials(c, cellphone);
    } catch (error) {
        return c.error(500, error.message || '服务器内部错误');
    }
}

module.exports = { matchesTeacherPassword, userLoginHandler };
