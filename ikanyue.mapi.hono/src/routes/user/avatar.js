/**
 * user/avatar.js
 *
 * @description :: 上传并更新用户头像
 *
 * POST /v1/user/avatar
 * Form-Data: file (必填)
 */

const { default: to } = require('await-to-js');
const pb = require('../../utils/pocketbase');
const { getFileUrl } = require('../../utils/fileUrl');
const path = require('path');

async function ensureAvatarFileField(client, collectionName) {
    try {
        const collection = await client.collections.getOne(collectionName);
        const schema = collection?.schema || [];
        const hasField = schema.some((f) => f.name === 'avatarFile');
        if (hasField) return;

        const newField = {
            name: 'avatarFile',
            type: 'file',
            required: false,
            maxSelect: 1,
            options: {
                maxSelect: 1,
                maxSize: 5 * 1024 * 1024,
                mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
                thumbs: ['64x64', '256x256'],
            },
        };

        const updatedSchema = [...schema, newField];
        await client.collections.update(collection.id, { schema: updatedSchema });
        console.log(`已为 ${collectionName} 添加 avatarFile 文件字段`);
    } catch (error) {
        console.warn(`检查/创建 ${collectionName}.avatarFile 字段失败:`, error.message);
    }
}

function pickFile(body = {}) {
    if (!body || typeof body !== 'object') {
        return null;
    }

    // 兼容常见字段名
    return body.file || body.avatar || body.image || null;
}

async function userAvatarUploadHandler(c) {
    const user = c.get('user');
    if (!user) {
        return c.error(403, '未授权操作，请先登录');
    }

    let body;
    try {
        body = await c.req.parseBody();
    } catch (error) {
        return c.error(400, '请求体解析失败');
    }

    const file = pickFile(body);
    if (!file || typeof file !== 'object') {
        return c.error(400, '请上传头像文件');
    }

    const fileSize = file.size || file.length || file.byteLength || 0;
    if (fileSize === 0) {
        return c.error(400, '头像文件为空，请重新选择');
    }

    if (typeof pb.ensureAuth !== 'function') {
        return c.error(500, 'PocketBase 未初始化');
    }

    try {
        await pb.ensureAuth();
    } catch (error) {
        console.error('PocketBase 认证失败:', error);
        return c.error(500, '服务暂不可用，请稍后重试');
    }

    const client = pb.getClient ? pb.getClient() : pb.pb;
    if (!client) {
        return c.error(500, 'PocketBase 客户端不可用');
    }

    const collectionName = user.role === 'teacher' ? 'teachers' : 'students';
    const FileCtor = typeof File !== 'undefined' ? File : null;
    if (!FileCtor) {
        return c.error(500, '服务器缺少 File 支持');
    }

    await ensureAvatarFileField(client, collectionName);

    let uploadFile = file;
    const filename = file.name || file.filename || file.originalname || file?.path && path.basename(file.path) || 'avatar.jpg';
    const mimeType = file.type || file.mimetype || 'application/octet-stream';

    try {
        if (!(file instanceof FileCtor) && typeof file.arrayBuffer === 'function') {
            const buffer = Buffer.from(await file.arrayBuffer());
            uploadFile = new FileCtor([buffer], filename, { type: mimeType });
        } else if (!(file instanceof FileCtor) && file.data && Buffer.isBuffer(file.data)) {
            uploadFile = new FileCtor([file.data], filename, { type: mimeType });
        }
    } catch (error) {
        console.warn('构造上传文件失败，使用原始对象', error);
    }

    const [updateErr, updatedRecord] = await to(
        client.collection(collectionName).update(user.id, {
            avatarFile: uploadFile,
        })
    );
    if (updateErr) {
        console.error('头像更新失败:', updateErr);
        return c.error(500, updateErr.message || '头像上传失败');
    }

    const avatarFilename =
        (updatedRecord &&
            (updatedRecord.avatarFile ||
                updatedRecord.avatar ||
                (Array.isArray(updatedRecord.avatarFile) && updatedRecord.avatarFile[0]) ||
                (Array.isArray(updatedRecord.avatar) && updatedRecord.avatar[0]))) ||
        '';

    const avatarUrl =
        (client.files && client.files.getURL
            ? client.files.getURL(updatedRecord, avatarFilename)
            : getFileUrl(updatedRecord, avatarFilename)) ||
        avatarFilename ||
        process.env.DEFAULT_AVATAR ||
        '';

    // 将文本 avatar 字段回填为可用 URL，便于前端直接读取
    if (avatarUrl) {
        try {
            await client.collection(collectionName).update(user.id, {
                avatar: avatarUrl,
            });
        } catch (err) {
            console.warn('回填 avatar 字段失败，但文件已上传:', err.message);
        }
    }

    const payload = {
        ...updatedRecord,
        avatar: avatarUrl || avatarFilename || '',
        avatarUrl,
    };

    return c.data(payload, '头像上传成功');
}

module.exports = { userAvatarUploadHandler };
