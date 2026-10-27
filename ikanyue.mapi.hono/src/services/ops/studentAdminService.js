const md5 = require('licia/md5');
const uuid = require('licia/uuid');

const { buildPagination, normalizeBoolean, normalizeString } = require('./opsUtils');

const STUDENTS = 'students';

class StudentAdminService {
    constructor(repository, auditService = null) {
        this.repository = repository;
        this.auditService = auditService;
    }

    async list(operator, query = {}) {
        assertAdmin(operator);
        const page = positivePage(query.page, 1);
        const perPage = Math.min(100, positivePage(query.perPage || query.limit, 20));
        const keyword = normalizeString(query.q || query.keyword);
        const status = normalizeString(query.status);
        const filters = [];
        if (keyword) {
            const value = escapeFilter(keyword);
            filters.push(`(realName ~ "${value}" || nickName ~ "${value}" || cellphone ~ "${value}")`);
        }
        if (status === 'active' || status === 'inactive') {
            filters.push(`blocked = ${status === 'inactive'}`);
        }
        const result = await this.repository.list(STUDENTS, page, perPage, {
            fields: 'id,realName,nickName,cellphone,avatar,blocked,lastLoginAt,created,updated',
            filter: filters.join(' && '),
            sort: sortValue(query.sort),
        });
        return {
            items: (result.items || []).map(projectStudent),
            pagination: buildPagination(result, page, perPage),
        };
    }

    async create(operator, input = {}) {
        assertAdmin(operator);
        const cellphone = required(input.cellphone, '手机号不能为空');
        const realName = required(input.realName, '学员姓名不能为空');
        const password = required(input.password, '初始密码不能为空');
        await this.ensureUniqueCellphone(cellphone);
        const student = await this.repository.create(STUDENTS, {
            blocked: normalizeBoolean(input.blocked),
            cellphone,
            gender: 0,
            nickName: normalizeString(input.nickName),
            password: md5(password),
            realName,
            sn: uuid(),
            tokenKey: uuid(),
        });
        await this.audit('ops.students.create', operator, student.id, { cellphone });
        return projectStudent(student);
    }

    async update(operator, id, input = {}) {
        assertAdmin(operator);
        const studentId = required(id, '学员不能为空');
        const current = await this.repository.get(STUDENTS, studentId);
        const cellphone = required(input.cellphone, '手机号不能为空');
        const realName = required(input.realName, '学员姓名不能为空');
        if (cellphone !== normalizeString(current.cellphone)) {
            await this.ensureUniqueCellphone(cellphone, studentId);
        }
        const data = {
            blocked: normalizeBoolean(input.blocked),
            cellphone,
            nickName: normalizeString(input.nickName),
            realName,
        };
        const password = normalizeString(input.password);
        if (password) {
            data.password = md5(password);
        }
        const student = await this.repository.update(STUDENTS, studentId, data);
        await this.audit('ops.students.update', operator, studentId, { blocked: data.blocked, cellphone });
        return projectStudent(student);
    }

    async ensureUniqueCellphone(cellphone, ignoredId = '') {
        const result = await this.repository.list(STUDENTS, 1, 2, { filter: `cellphone = "${escapeFilter(cellphone)}"` });
        if ((result.items || []).some((student) => student.id !== ignoredId)) {
            const error = new Error('手机号已注册');
            error.code = 409;
            throw error;
        }
    }

    async audit(action, actor, resourceId, metadata) {
        return this.auditService?.record({ action, actor, metadata, resourceId, resourceType: STUDENTS });
    }
}

function assertAdmin(user = {}) {
    if (!user.id || !user.isAdmin) {
        const error = new Error('需要管理员权限');
        error.code = 403;
        throw error;
    }
}

function required(value, message) {
    const text = normalizeString(value);
    if (!text) {
        const error = new Error(message);
        error.code = 400;
        throw error;
    }
    return text;
}

function positivePage(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function sortValue(value) {
    const sort = normalizeString(value);
    if (sort === 'name-asc') return 'realName';
    if (sort === 'name-desc') return '-realName';
    if (sort === 'created-asc') return 'created';
    return '-created';
}

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function projectStudent(student = {}) {
    return {
        avatar: normalizeString(student.avatar),
        blocked: Boolean(student.blocked),
        cellphone: normalizeString(student.cellphone),
        created: normalizeString(student.created),
        id: normalizeString(student.id),
        lastLoginAt: normalizeString(student.lastLoginAt),
        nickName: normalizeString(student.nickName),
        realName: normalizeString(student.realName),
        updated: normalizeString(student.updated),
    };
}

module.exports = { StudentAdminService, projectStudent };
