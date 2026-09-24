const { invariant } = require('../domain');
const { jwtAuth } = require('../../../utils/jwtAuth');

const CHALLENGE_TTL_SECONDS = 5 * 60;

class WechatIdentityService {
    constructor(client, options = {}) {
        this.client = client;
        this.appId = options.appId ?? process.env.WECHAT_APPID ?? '';
        this.clock = options.clock || Date.now;
        this.jwt = options.jwt || jwtAuth;
    }

    async findTeacherByCellphone(cellphone) {
        const result = await this.client.collection('teachers').getList(1, 1, {
            filter: `cellphone="${escapeFilter(cellphone)}"`,
        });
        const teacher = result.items?.[0] || null;
        return teacher && isAvailableTeacher(teacher) ? teacher : null;
    }

    createRoleChallenge(request, context) {
        const candidates = context.candidates || [];
        invariant(candidates.length > 1, 'WECHAT_ROLE_CHALLENGE_NOT_REQUIRED', '当前账号不需要选择身份');
        const roles = candidates.map((candidate) => candidate.role);
        const principals = Object.fromEntries(candidates.map((candidate) => [candidate.role, candidate.record.id]));
        const expiresAt = Math.floor(this.clock() / 1000) + CHALLENGE_TTL_SECONDS;
        const challenge = this.jwt.sign(request, 'wechat-role', context.openid, 'role_challenge', false, {
            appId: this.appId,
            cellphone: context.cellphone,
            challengeType: 'wechat-role-selection',
            challengeExpiresAt: expiresAt,
            openid: context.openid,
            unionid: context.unionid || '',
            principals,
            roles,
        }, { expiresIn: CHALLENGE_TTL_SECONDS });
        return {
            requiresRoleSelection: true,
            challenge,
            expiresAt,
            roles: candidates.map(({ role, record }) => roleOption(role, record)),
        };
    }

    async completeRoleChallenge(request, challenge, role) {
        const claims = this.jwt.check(challenge);
        invariant(claims?.challengeType === 'wechat-role-selection',
            'WECHAT_ROLE_CHALLENGE_INVALID', '身份选择凭证无效');
        invariant(Number(claims.challengeExpiresAt) > Math.floor(this.clock() / 1000),
            'WECHAT_ROLE_CHALLENGE_EXPIRED', '身份选择凭证已过期');
        invariant(Array.isArray(claims.roles) && claims.roles.includes(role),
            'WECHAT_ROLE_NOT_AVAILABLE', '所选身份不可用');
        const principalId = claims.principals?.[role];
        const collection = role === 'teacher' ? 'teachers' : 'students';
        const record = await this.client.collection(collection).getOne(principalId);
        validatePrincipal(role, record);
        return this.issuePrincipal(request, role, record, {
            openid: claims.openid,
            unionid: claims.unionid || '',
        });
    }

    async issuePrincipal(request, role, record, identity = {}) {
        validatePrincipal(role, record);
        await this.bindIdentity(role, record.id, identity);
        const isAdmin = role === 'teacher' && truthy(record.idAdmin ?? record.isAdmin);
        const capabilities = role === 'teacher' ? normalizeCapabilities(record.courseCreditCapabilities) : [];
        const token = this.jwt.sign(request, record.id, record.sn, role, isAdmin, {
            courseCreditCapabilities: capabilities,
            wechatOpenId: identity.openid || '',
        });
        return {
            ...record,
            role,
            isAdmin,
            courseCreditCapabilities: capabilities,
            token,
        };
    }

    async bindIdentity(principalType, principalId, identity = {}) {
        if (!identity.openid || !this.appId) return null;
        const collection = this.client.collection('wechat_identities');
        const filter = `appId="${escapeFilter(this.appId)}" && openId="${escapeFilter(identity.openid)}"`
            + ` && principalType="${principalType}" && principalId="${escapeFilter(principalId)}"`;
        let existing = null;
        try {
            existing = await collection.getFirstListItem(filter);
        } catch (error) {
            if (error?.status !== 404) throw error;
        }
        const data = {
            appId: this.appId,
            openId: identity.openid,
            unionId: identity.unionid || '',
            principalType,
            principalId,
            status: 'active',
            lastUsedAt: new Date(this.clock()).toISOString(),
        };
        return existing ? collection.update(existing.id, data) : collection.create(data);
    }

    async listRoles(openid) {
        invariant(typeof openid === 'string' && openid,
            'WECHAT_IDENTITY_REQUIRED', '当前登录未绑定微信身份');
        const identities = await this.client.collection('wechat_identities').getFullList({
            filter: `appId="${escapeFilter(this.appId)}" && openId="${escapeFilter(openid)}" && status="active"`,
            sort: 'principalType',
        });
        const roles = [];
        for (const identity of identities) {
            const collection = identity.principalType === 'teacher' ? 'teachers' : 'students';
            const record = await this.client.collection(collection).getOne(identity.principalId);
            if (isAvailablePrincipal(identity.principalType, record)) {
                roles.push(roleOption(identity.principalType, record));
            }
        }
        return roles;
    }

    async switchRole(request, openid, role) {
        invariant(role === 'student' || role === 'teacher',
            'WECHAT_ROLE_INVALID', '微信身份类型无效');
        const identity = await this.client.collection('wechat_identities').getFirstListItem(
            `appId="${escapeFilter(this.appId)}" && openId="${escapeFilter(openid)}"`
            + ` && principalType="${escapeFilter(role)}" && status="active"`
        );
        const collection = role === 'teacher' ? 'teachers' : 'students';
        const record = await this.client.collection(collection).getOne(identity.principalId);
        return this.issuePrincipal(request, role, record, { openid, unionid: identity.unionId || '' });
    }
}

function validatePrincipal(role, record) {
    invariant(record && !truthy(record.blocked), 'WECHAT_PRINCIPAL_UNAVAILABLE', '账号已停用');
    if (role === 'teacher') {
        invariant(truthy(record.verified), 'WECHAT_TEACHER_NOT_VERIFIED', '教师账号尚未通过审核');
    } else {
        invariant(role === 'student', 'WECHAT_ROLE_INVALID', '微信身份类型无效');
    }
}

function isAvailablePrincipal(role, record) {
    try {
        validatePrincipal(role, record);
        return true;
    } catch {
        return false;
    }
}

function isAvailableTeacher(record) {
    return isAvailablePrincipal('teacher', record);
}

function roleOption(role, record) {
    return {
        role,
        id: record.id,
        name: record.realName || record.realname || record.nickName || record.nickname || (role === 'teacher' ? '教师' : '学员'),
        avatar: record.avatarUrl || record.avatar || '',
    };
}

function normalizeCapabilities(value) {
    return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item.trim()))] : [];
}

function truthy(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

module.exports = {
    CHALLENGE_TTL_SECONDS,
    WechatIdentityService,
    isAvailablePrincipal,
    normalizeCapabilities,
    roleOption,
    validatePrincipal,
};
