/**
 * user/wechatLogin.js
 *
 * @description :: 微信授权登录 / 注册接口
 */

const { default: to } = require('await-to-js');
const uuid = require('licia/uuid');
const pb = require('../../utils/pocketbase');
const { exchangeCodeForSession, decryptPhoneNumber, validateUserSignature } = require('../../utils/wechat');
const { WechatIdentityService } = require('../../services/courseCredits/booking/wechatIdentityService');

const DEFAULT_AVATAR = process.env.DEFAULT_AVATAR || '';

function buildFilter(expressions = []) {
    if (!expressions.length) {
        return '';
    }
    if (expressions.length === 1) {
        return expressions[0];
    }
    return `(${expressions.join(') || (')})`;
}

function normalizeCellphone(cellphone = '') {
    return `${cellphone}`.trim().replace(/\s+/g, '').replace(/^\+?86/, '');
}

function buildWechatIdentityData(openid, unionid) {
    const data = {};

    if (openid) {
        data.wechatId = openid;
    }

    if (unionid) {
        data.wechatUnionId = unionid;
    }

    return data;
}

async function findStudentByWechat(openid, unionid) {
    const filter = buildFilter(
        [openid ? `wechatId="${openid}"` : null, unionid ? `wechatUnionId="${unionid}"` : null].filter(Boolean)
    );
    if (!filter) {
        return null;
    }

    const [err, list] = await to(
        pb.collection('students').getList(1, 1, {
            filter,
        })
    );
    if (err) {
        throw err;
    }
    return list?.items?.[0] || null;
}

async function findStudentByCellphone(cellphone) {
    const normalizedCellphone = normalizeCellphone(cellphone);
    if (!normalizedCellphone) {
        return null;
    }
    const [err, list] = await to(
        pb.collection('students').getList(1, 1, {
            filter: `cellphone="${normalizedCellphone}"`,
        })
    );
    if (err) {
        throw err;
    }
    return list?.items?.[0] || null;
}

function normalizeNickname(userInfo = {}, fallback) {
    const nickName = userInfo.nickName || fallback;
    return nickName;
}

function extractErrorText(error) {
    if (!error) {
        return '';
    }

    const segments = [
        error.message,
        error.response?.message,
        error.response?.data ? JSON.stringify(error.response.data) : '',
        error.data ? JSON.stringify(error.data) : '',
    ];

    return segments
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function extractValidationFieldNames(error) {
    const responseData = error?.response?.data || error?.data;
    if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
        return [];
    }

    return Object.keys(responseData);
}

function isDuplicateCreateError(error) {
    if (!error) {
        return false;
    }

    if (error.status === 409) {
        return true;
    }

    const errorText = extractErrorText(error);
    return [
        'already exists',
        'duplicate',
        'must be unique',
        'validation_not_unique',
        'value must be unique',
        'unique constraint',
        '手机号已注册',
    ].some((keyword) => errorText.includes(keyword));
}

function buildWechatStudentUpdateData(student, { openid, unionid, hydratedUserInfo, loginMeta, cellphone }) {
    const updateData = {
        wechatUserInfo: hydratedUserInfo,
        cellphone,
        ...loginMeta,
        ...buildWechatIdentityData(openid, unionid),
    };

    const hasNickname = Boolean((student.nickName || student.nickname || '').trim());
    if (!hasNickname) {
        const nickname = normalizeNickname(hydratedUserInfo, `微信用户${cellphone.slice(-4)}`);
        if (nickname) {
            updateData.nickName = nickname;
            updateData.nickname = nickname;
        }
    }

    const avatarFromWechat = hydratedUserInfo.avatarUrl || DEFAULT_AVATAR;
    if (!student.avatar || !student.avatar.trim()) {
        updateData.avatar = avatarFromWechat;
    }

    const hasGender = !(student.gender === undefined || student.gender === null || `${student.gender}` === '');
    if (!hasGender && hydratedUserInfo.gender !== '' && hydratedUserInfo.gender !== undefined && hydratedUserInfo.gender !== null) {
        updateData.gender = hydratedUserInfo.gender;
    }

    const hasAge = !(student.age === undefined || student.age === null || `${student.age}` === '');
    if (!hasAge && hydratedUserInfo.age !== '' && hydratedUserInfo.age !== undefined && hydratedUserInfo.age !== null) {
        const parsedAge = Number(hydratedUserInfo.age);
        updateData.age = Number.isNaN(parsedAge) ? hydratedUserInfo.age : parsedAge;
    }

    return updateData;
}

async function updateStudentWechatProfile(student, context) {
    const updateData = buildWechatStudentUpdateData(student, context);
    const [updateErr, updatedStudent] = await to(pb.collection('students').update(student.id, updateData));

    if (updateErr) {
        throw updateErr;
    }

    return updatedStudent;
}

function normalizeRequestBody(payload) {
    if (!payload) {
        return {};
    }

    if (typeof payload === 'string') {
        try {
            return JSON.parse(payload);
        } catch (error) {
            console.warn('无法解析请求体 JSON:', error);
            return {};
        }
    }

    if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        const normalized = {};
        payload.forEach((value, key) => {
            normalized[key] = value;
        });
        payload = normalized;
    }

    ['phone', 'userInfo'].forEach((fieldName) => {
        if (typeof payload[fieldName] !== 'string') {
            return;
        }
        try {
            payload[fieldName] = JSON.parse(payload[fieldName]);
        } catch (error) {
            console.warn(`无法解析 ${fieldName} JSON:`, error);
            payload[fieldName] = {};
        }
    });

    return payload;
}

async function userWechatLoginHandler(c) {
    const contentType = c.req.header('content-type') || '';
    const query = c.req.query();
    let body = {};
    if (contentType.includes('application/json')) {
        body = await c.req.json();
    } else {
        body = await c.req.parseBody();
    }

    body = normalizeRequestBody(body);

    const resolveParam = (...values) => {
        for (const value of values) {
            if (value === undefined || value === null) {
                continue;
            }
            const str = `${value}`.trim();
            if (str) {
                return str;
            }
        }
        return '';
    };

    const code = resolveParam(body.code, body.authCode, body.auth_code, query.code, query.authCode, query.auth_code);
    const userInfo = body.userInfo || {};
    const phonePayload = body.phone || {};
    const rawData = body.rawData || '';
    const signature = body.signature || '';

    if (!code) {
        return c.error(400, '缺少微信登录凭证');
    }

    if (!phonePayload.encryptedData || !phonePayload.iv) {
        return c.error(400, '缺少微信手机号授权信息');
    }

    const [sessionErr, sessionData] = await to(exchangeCodeForSession(code));
    if (sessionErr) {
        console.error('调用微信接口失败:', sessionErr);
        return c.error(500, sessionErr.message || '微信认证失败，请稍后重试');
    }

    const { openid, unionid = '', session_key: sessionKey } = sessionData || {};
    if (!openid || !sessionKey) {
        return c.error(500, '微信返回数据异常，请稍后重试');
    }

    if (!validateUserSignature(rawData, sessionKey, signature)) {
        return c.error(403, '微信用户信息校验失败，请重新授权');
    }

    let decryptedPhone;
    try {
        decryptedPhone = decryptPhoneNumber(sessionKey, phonePayload.encryptedData, phonePayload.iv);
    } catch (error) {
        console.error('解密微信手机号失败:', error);
        return c.error(400, '微信手机号解析失败，请重新授权');
    }

    const cellphone = normalizeCellphone(decryptedPhone?.purePhoneNumber || decryptedPhone?.phoneNumber || '');
    if (!cellphone) {
        return c.error(400, '未获取到有效的手机号');
    }

    let student = null;
    try {
        student = (await findStudentByWechat(openid, unionid)) || (await findStudentByCellphone(cellphone));
    } catch (error) {
        console.error('查询学生记录失败:', error);
        return c.error(500, '查询用户信息失败，请稍后再试');
    }

    const loginMeta = {
        lastLoginAt: new Date().toISOString(),
        lastLoginIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
        lastLoginMethod: 'wechat',
    };

    const hydratedUserInfo = {
        avatarUrl: userInfo.avatarUrl || userInfo.avatar || '',
        nickName: userInfo.nickName || userInfo.nickname || '',
        gender: userInfo.gender ?? '',
        language: userInfo.language || '',
        city: userInfo.city || '',
        province: userInfo.province || '',
        country: userInfo.country || '',
        age: userInfo.age ?? '',
    };

    const identityService = new WechatIdentityService(pb);
    let teacher = null;
    try {
        teacher = await identityService.findTeacherByCellphone(cellphone);
    } catch (error) {
        console.error('查询教师微信身份失败:', error);
        return c.error(500, '查询用户身份失败，请稍后再试');
    }

    if (teacher && (!student || student.blocked)) {
        return c.data(await identityService.issuePrincipal(c.req, 'teacher', teacher, { openid, unionid }));
    }

    if (student) {
        if (student.blocked) {
            return c.error(403, '该账号已被封禁，请联系客服');
        }

        try {
            student = await updateStudentWechatProfile(student, {
                openid,
                unionid,
                hydratedUserInfo,
                loginMeta,
                cellphone,
            });
        } catch (updateErr) {
            console.error('更新学生微信信息失败:', updateErr);
            return c.error(500, '更新用户信息失败，请稍后重试');
        }
        if (teacher) {
            return c.data(identityService.createRoleChallenge(c.req, {
                candidates: [
                    { role: 'student', record: student },
                    { role: 'teacher', record: teacher },
                ],
                cellphone,
                openid,
                unionid,
            }));
        }
    } else {
        const nickname = normalizeNickname(hydratedUserInfo, `微信用户${cellphone.slice(-4)}`);
        const newStudentData = {
            cellphone,
            password: '',
            tokenKey: uuid(),
            sn: uuid(),
            nickName: nickname,
            nickname,
            avatar: hydratedUserInfo.avatarUrl || DEFAULT_AVATAR,
            gender: hydratedUserInfo.gender || 0,
            idcard: null,
            blocked: false,
            wechatUserInfo: hydratedUserInfo,
            ...loginMeta,
            ...buildWechatIdentityData(openid, unionid),
        };

        const [createErr, createdStudent] = await to(pb.collection('students').create(newStudentData));
        if (createErr) {
            const duplicateCreate = isDuplicateCreateError(createErr);
            if (duplicateCreate) {
                const conflictFields = extractValidationFieldNames(createErr);
                console.warn(
                    '创建微信学生命中重复约束，尝试恢复已有账号:',
                    conflictFields.length ? { conflictFields } : createErr
                );
            } else {
                console.error('创建微信学生失败:', createErr);
            }

            if (!duplicateCreate) {
                return c.error(500, '创建用户失败，请稍后重试');
            }

            try {
                const existingStudent =
                    (await findStudentByWechat(openid, unionid)) || (await findStudentByCellphone(cellphone));

                if (!existingStudent) {
                    return c.error(500, '创建用户失败，请稍后重试');
                }

                if (existingStudent.blocked) {
                    return c.error(403, '该账号已被封禁，请联系客服');
                }

                student = await updateStudentWechatProfile(existingStudent, {
                    openid,
                    unionid,
                    hydratedUserInfo,
                    loginMeta,
                    cellphone,
                });
            } catch (recoveryErr) {
                console.error('恢复微信学生登录失败:', recoveryErr);
                return c.error(500, '创建用户失败，请稍后重试');
            }
        } else {
            student = createdStudent;
        }
    }

    if (!student.avatar || student.avatar.trim() === '') {
        student.avatar = DEFAULT_AVATAR;
    }

    return c.data(await identityService.issuePrincipal(c.req, 'student', student, { openid, unionid }));
}

module.exports = { userWechatLoginHandler };
