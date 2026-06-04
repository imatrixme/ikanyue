const md5 = require('licia/md5');
const { jwtAuth } = require('../../utils/jwtAuth');
const { normalizeBoolean, normalizeString } = require('./opsUtils');

const TEACHER_FIELDS = 'id,sn,username,email,cellphone,nickname,nickName,avatar,realname,realName,blocked,verified,isAdmin,idAdmin,opsPasswordChangeRequired,lastLoginAt,created,updated';
const DEFAULT_ADMIN_PASSWORD = '1loveU_shaoyi';
const MIN_PASSWORD_LENGTH = 8;

class OpsAuthService {
    constructor(repository, auditService) {
        this.repository = repository;
        this.auditService = auditService;
    }

    async login({ account, username, cellphone, password }, request = {}) {
        const normalizedAccount = normalizeString(account || username || cellphone);
        if (!normalizedAccount || !password) {
            return { ok: false, code: 400, message: '账号和密码不能为空' };
        }

        const result = await this.repository.list('teachers', 1, 1, {
            filter: buildTeacherLoginFilter(normalizedAccount),
            fields: `${TEACHER_FIELDS},password`,
        });
        const teacher = result.items?.[0];
        if (!teacher || !(await this.matchesPassword(teacher, password, normalizedAccount))) {
            await this.auditService.denied(null, 'ops.auth.login', 'teacher', '', { account: normalizedAccount });
            return { ok: false, code: 401, message: '后台账号或密码错误' };
        }
        if (teacher.blocked) {
            await this.auditService.denied(teacher, 'ops.auth.login', 'teacher', teacher.id, { reason: 'blocked' });
            return { ok: false, code: 403, message: '该教师账号已被禁用' };
        }
        if (!normalizeBoolean(teacher.verified)) {
            await this.auditService.denied(teacher, 'ops.auth.login', 'teacher', teacher.id, { reason: 'unverified' });
            return { ok: false, code: 403, message: '教师账号未审核' };
        }

        const isAdmin = normalizeBoolean(teacher.idAdmin ?? teacher.isAdmin);
        await this.repository.update('teachers', teacher.id, {
            lastLoginAt: new Date().toISOString(),
            lastLoginMethod: 'ops-password',
        });

        const profile = projectOpsProfile({ ...teacher, isAdmin });
        const token = signOpsToken(request, teacher, isAdmin, profile.passwordChangeRequired);
        await this.auditService.record({
            actor: profile,
            action: 'ops.auth.login',
            resourceType: 'teacher',
            resourceId: teacher.id,
        });

        return { ok: true, data: { token, profile } };
    }

    async changePassword(user, { currentPassword, newPassword, confirmPassword } = {}, request = {}) {
        if (!user?.id || user.role !== 'teacher') {
            return { ok: false, code: 403, message: '后台仅允许教师或管理员访问' };
        }
        const teacher = await this.repository.get('teachers', user.id, { fields: `${TEACHER_FIELDS},password` });
        if (teacher.blocked || !normalizeBoolean(teacher.verified)) {
            return { ok: false, code: 403, message: '教师账号不可用' };
        }
        if (!currentPassword || !newPassword) {
            return { ok: false, code: 400, message: '当前密码和新密码不能为空' };
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            return { ok: false, code: 400, message: `新密码至少需要 ${MIN_PASSWORD_LENGTH} 位` };
        }
        if (newPassword === DEFAULT_ADMIN_PASSWORD) {
            return { ok: false, code: 400, message: '新密码不能继续使用默认密码' };
        }
        if (newPassword !== confirmPassword) {
            return { ok: false, code: 400, message: '两次输入的新密码不一致' };
        }
        if (!(await this.matchesPassword(teacher, currentPassword, teacher.cellphone || teacher.username))) {
            await this.auditService.denied(user, 'ops.auth.change_password', 'teacher', teacher.id, { reason: 'password_mismatch' });
            return { ok: false, code: 401, message: '当前密码不正确' };
        }
        await this.repository.update('teachers', teacher.id, {
            password: newPassword,
            passwordConfirm: newPassword,
            opsPasswordChangeRequired: false,
            lastPasswordChangedAt: new Date().toISOString(),
        });

        const profile = projectOpsProfile({ ...teacher, opsPasswordChangeRequired: false });
        const isAdmin = normalizeBoolean(profile.isAdmin);
        const token = signOpsToken(request, teacher, isAdmin, false);
        await this.auditService.record({
            actor: profile,
            action: 'ops.auth.change_password',
            resourceType: 'teacher',
            resourceId: teacher.id,
        });

        return { ok: true, data: { token, profile } };
    }

    async register({ cellphone, password, nickName, realName } = {}, request = {}) {
        if (!isRegistrationEnabled()) {
            await this.auditService.denied(null, 'ops.auth.register', 'teacher', '', { reason: 'disabled' });
            return { ok: false, code: 403, message: '教务系统注册未开放' };
        }

        const payload = normalizeRegistrationPayload({ cellphone, password, nickName, realName });
        const validationError = validateRegistrationPayload(payload);
        if (validationError) {
            return { ok: false, code: 400, message: validationError };
        }

        const existing = await this.repository.list('teachers', 1, 1, {
            filter: `cellphone="${payload.cellphone}"`,
            fields: 'id,cellphone',
        });
        if (existing.items?.length) {
            return { ok: false, code: 409, message: '该手机号已注册' };
        }

        try {
            const created = await this.repository.create('teachers', buildPendingTeacherRecord(payload));
            const profile = projectOpsProfile(created);
            await this.auditService.record({
                actor: profile,
                action: 'ops.auth.register',
                resourceType: 'teacher',
                resourceId: created.id,
                metadata: {
                    ip: request?.header?.('x-forwarded-for') || request?.header?.('x-real-ip') || '',
                    status: 'pending_activation',
                },
            });
            return {
                ok: true,
                data: {
                    status: 'pending_activation',
                    message: '注册成功，请等待管理员激活',
                    profile,
                },
            };
        } catch (error) {
            if (isDuplicateTeacherError(error)) {
                return { ok: false, code: 409, message: '该手机号已注册' };
            }
            throw error;
        }
    }

    async me(user) {
        if (!user?.id || user.role !== 'teacher') {
            return { ok: false, code: 403, message: '后台仅允许教师或管理员访问' };
        }

        const teacher = await this.repository.get('teachers', user.id, { fields: TEACHER_FIELDS });
        if (teacher.blocked || !normalizeBoolean(teacher.verified)) {
            return { ok: false, code: 403, message: '教师账号不可用' };
        }
        return {
            ok: true,
            data: {
                profile: projectOpsProfile({
                    ...teacher,
                    isAdmin: normalizeBoolean(user.isAdmin || teacher.isAdmin || teacher.idAdmin),
                }),
            },
        };
    }

    async matchesPassword(teacher, password, cellphone) {
        if (await authenticatePocketBaseTeacher(teacher, password, cellphone)) {
            return true;
        }
        return teacher.password === md5(password) || teacher.password === password;
    }
}

function projectOpsProfile(teacher = {}) {
    const isAdmin = normalizeBoolean(teacher.idAdmin ?? teacher.isAdmin);
    return {
        id: teacher.id,
        sn: teacher.sn,
        role: isAdmin ? 'admin' : 'teacher',
        isAdmin,
        cellphone: teacher.cellphone,
        nickName: teacher.nickName || teacher.nickname || teacher.realName || teacher.realname || '',
        realName: teacher.realName || teacher.realname || '',
        avatar: teacher.avatar || '',
        verified: normalizeBoolean(teacher.verified),
        blocked: normalizeBoolean(teacher.blocked),
        passwordChangeRequired: normalizeBoolean(teacher.opsPasswordChangeRequired),
    };
}

function buildTeacherLoginFilter(account) {
    return `(cellphone="${account}" || username="${account}" || email="${account}")`;
}

function signOpsToken(request, teacher, isAdmin, passwordChangeRequired) {
    return jwtAuth.sign(request, teacher.id, teacher.sn, 'teacher', isAdmin, {
        passwordChangeRequired: Boolean(passwordChangeRequired),
    });
}

function isRegistrationEnabled() {
    return normalizeBoolean(process.env.OPS_REGISTRATION_ENABLED);
}

function normalizeRegistrationPayload(input = {}) {
    const realName = normalizeString(input.realName || input.realname);
    const nickName = normalizeString(input.nickName || input.nickname) || realName;
    return {
        cellphone: normalizeString(input.cellphone),
        password: typeof input.password === 'string' ? input.password : '',
        nickName,
        realName,
    };
}

function validateRegistrationPayload(payload) {
    if (!payload.cellphone) {
        return '手机号不能为空';
    }
    if (!/^1\d{10}$/.test(payload.cellphone)) {
        return '手机号格式不正确';
    }
    if (!payload.password) {
        return '密码不能为空';
    }
    if (payload.password.length < 8) {
        return '密码至少需要 8 位';
    }
    if (!payload.realName && !payload.nickName) {
        return '姓名不能为空';
    }
    return '';
}

function buildPendingTeacherRecord(payload) {
    return {
        sn: `teacher_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        username: payload.cellphone,
        cellphone: payload.cellphone,
        idcard: `ops_${payload.cellphone}`,
        password: payload.password,
        passwordConfirm: payload.password,
        nickName: payload.nickName,
        realname: payload.realName,
        blocked: true,
        verified: false,
        idAdmin: false,
    };
}

async function authenticatePocketBaseTeacher(teacher, password, cellphone) {
    const identities = [teacher.username, teacher.email, cellphone].map(normalizeString).filter(Boolean);
    if (!identities.length) {
        return false;
    }
    try {
        const PocketBase = await import('pocketbase');
        const url = process.env.PB_URL || 'http://127.0.0.1:8090';
        for (const identity of [...new Set(identities)]) {
            const authClient = new PocketBase.default(url);
            try {
                const auth = await authClient.collection('teachers').authWithPassword(identity, password);
                if (auth?.record?.id === teacher.id) {
                    return true;
                }
            } catch {
                // Try the next configured identity.
            }
        }
    } catch {
        return false;
    }
    return false;
}

function isDuplicateTeacherError(error = {}) {
    const text = `${error.message || ''} ${JSON.stringify(error.response || {})}`;
    return error.status === 400 && /(cellphone|username|手机号).*?(unique|already)|(?:unique|already).*?(cellphone|username|手机号)/i.test(text);
}

module.exports = { OpsAuthService, projectOpsProfile, isRegistrationEnabled };
