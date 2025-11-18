/**
 * user/wechatLogin.js
 *
 * @description :: 微信授权登录 / 注册接口
 */

const { default: to } = require('await-to-js');
const uuid = require('licia/uuid');
const pb = require('../../utils/pocketbase');
const { jwtAuth } = require('../../utils/jwtAuth');
const { exchangeCodeForSession, decryptPhoneNumber, validateUserSignature } = require('../../utils/wechat');

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
  if (!cellphone) {
    return null;
  }
  const [err, list] = await to(
    pb.collection('students').getList(1, 1, {
      filter: `cellphone="${cellphone}"`,
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

async function userWechatLoginHandler(c) {
  const contentType = c.req.header('content-type') || '';
  let body = {};
  if (contentType.includes('application/json')) {
    body = await c.req.json();
  } else {
    body = await c.req.parseBody();
  }

  const code = (body.code || '').trim();
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

  const cellphone = decryptedPhone?.purePhoneNumber || decryptedPhone?.phoneNumber || '';
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
  };

  if (student) {
    if (student.blocked) {
      return c.error(403, '该账号已被封禁，请联系客服');
    }

    const nickname = normalizeNickname(hydratedUserInfo, student.nickName || student.nickname || `用户${cellphone.slice(-4)}`);
    const updateData = {
      wechatId: openid,
      wechatUnionId: unionid || '',
      wechatUserInfo: hydratedUserInfo,
      nickName: nickname,
      nickname,
      avatar: hydratedUserInfo.avatarUrl || student.avatar || DEFAULT_AVATAR,
      ...loginMeta,
    };

    if (!student.cellphone || student.cellphone === '') {
      updateData.cellphone = cellphone;
    }

    const [updateErr, updatedStudent] = await to(pb.collection('students').update(student.id, updateData));
    if (updateErr) {
      console.error('更新学生微信信息失败:', updateErr);
      return c.error(500, '更新用户信息失败，请稍后重试');
    }
    student = updatedStudent;
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
      blocked: false,
      wechatId: openid,
      wechatUnionId: unionid || '',
      wechatUserInfo: hydratedUserInfo,
      ...loginMeta,
    };

    const [createErr, createdStudent] = await to(pb.collection('students').create(newStudentData));
    if (createErr) {
      console.error('创建微信学生失败:', createErr);
      return c.error(500, '创建用户失败，请稍后重试');
    }
    student = createdStudent;
  }

  if (!student.avatar || student.avatar.trim() === '') {
    student.avatar = DEFAULT_AVATAR;
  }

  student.role = 'student';
  student.isAdmin = false;
  student.token = jwtAuth.sign(c.req, student.id, student.sn, 'student', false);

  return c.data(student);
}

module.exports = { userWechatLoginHandler };
