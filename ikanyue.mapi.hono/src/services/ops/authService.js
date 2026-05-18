const md5 = require('licia/md5');
const { jwtAuth } = require('../../utils/jwtAuth');
const { normalizeBoolean, normalizeString } = require('./opsUtils');

const TEACHER_FIELDS = 'id,sn,cellphone,nickName,avatar,realName,blocked,verified,isAdmin,idAdmin,lastLoginAt,created,updated';

class OpsAuthService {
    constructor(repository, auditService) {
        this.repository = repository;
        this.auditService = auditService;
    }

    async login({ cellphone, password }, request = {}) {
        const normalizedCellphone = normalizeString(cellphone);
        if (!normalizedCellphone || !password) {
            return { ok: false, code: 400, message: '手机号和密码不能为空' };
        }

        const result = await this.repository.list('teachers', 1, 1, {
            filter: `cellphone="${normalizedCellphone}"`,
            fields: `${TEACHER_FIELDS},password`,
        });
        const teacher = result.items?.[0];
        if (!teacher || teacher.password !== md5(password)) {
            await this.auditService.denied(null, 'ops.auth.login', 'teacher', '', { cellphone: normalizedCellphone });
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

        const isAdmin = normalizeBoolean(teacher.isAdmin ?? teacher.idAdmin);
        await this.repository.update('teachers', teacher.id, {
            lastLoginAt: new Date().toISOString(),
            lastLoginMethod: 'ops-password',
        });

        const profile = projectOpsProfile({ ...teacher, isAdmin });
        const token = jwtAuth.sign(request, teacher.id, teacher.sn, 'teacher', isAdmin);
        await this.auditService.record({
            actor: profile,
            action: 'ops.auth.login',
            resourceType: 'teacher',
            resourceId: teacher.id,
        });

        return { ok: true, data: { token, profile } };
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
}

function projectOpsProfile(teacher = {}) {
    const isAdmin = normalizeBoolean(teacher.isAdmin ?? teacher.idAdmin);
    return {
        id: teacher.id,
        sn: teacher.sn,
        role: isAdmin ? 'admin' : 'teacher',
        isAdmin,
        cellphone: teacher.cellphone,
        nickName: teacher.nickName || teacher.realName || '',
        realName: teacher.realName || '',
        avatar: teacher.avatar || '',
        verified: normalizeBoolean(teacher.verified),
        blocked: normalizeBoolean(teacher.blocked),
    };
}

module.exports = { OpsAuthService, projectOpsProfile };
