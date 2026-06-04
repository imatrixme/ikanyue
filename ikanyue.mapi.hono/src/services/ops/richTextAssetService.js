const path = require('node:path');

const { normalizeString } = require('./opsUtils');
const { getFileUrl } = require('../../utils/fileUrl');

const RICH_TEXT_ASSET_COLLECTION = 'ops_rich_text_assets';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

class OpsRichTextAssetService {
    constructor(repository, rbacService, auditService) {
        this.repository = repository;
        this.rbacService = rbacService;
        this.auditService = auditService;
    }

    async uploadImage(user, body = {}) {
        this.rbacService.assertTeacher(user);
        const sourceFile = pickImageFile(body);
        const normalized = await normalizeUploadFile(sourceFile);
        validateImageFile(normalized);
        await ensureRepositoryAuth(this.repository);

        const created = await this.repository.create(RICH_TEXT_ASSET_COLLECTION, {
            title: normalizeString(body.title) || normalized.filename,
            image: normalized.file,
            mimeType: normalized.mimeType,
            size: normalized.size,
            source: normalizeString(body.source) || 'rich-text-editor',
            createdBy: user.id,
            metadata: {
                originalName: normalized.filename,
                field: normalized.field,
            },
        });

        const filename = resolveStoredFilename(created.image, normalized.filename);
        await this.auditService.record({
            actor: user,
            action: 'ops.rich_text_asset.upload',
            resourceType: 'rich_text_asset',
            resourceId: created.id,
        });

        return {
            id: created.id,
            recordId: created.id,
            collection: RICH_TEXT_ASSET_COLLECTION,
            filename,
            mimeType: created.mimeType || normalized.mimeType,
            size: created.size || normalized.size,
            url: resolveAssetUrl(this.repository.client, created, filename),
        };
    }
}

function pickImageFile(body = {}) {
    const candidates = [
        ['file', body.file],
        ['image', body.image],
        ['upload', body.upload],
    ];
    const match = candidates.find(([, value]) => value && typeof value === 'object');
    if (!match) {
        const error = new Error('请上传富文本图片');
        error.code = 400;
        throw error;
    }
    const [field, file] = match;
    return { field, file };
}

async function normalizeUploadFile({ field, file }) {
    const filename = file.name || file.filename || file.originalname || (file.path ? path.basename(file.path) : '') || 'rich-text-image.png';
    const mimeType = file.type || file.mimetype || mimeTypeFromFilename(filename);
    const size = Number(file.size || file.length || file.byteLength || 0);
    const FileCtor = typeof File !== 'undefined' ? File : null;

    if (FileCtor && file instanceof FileCtor) {
        return { field, file, filename, mimeType, size: size || file.size || 0 };
    }
    if (!FileCtor) {
        const error = new Error('服务器缺少 File 支持');
        error.code = 500;
        throw error;
    }
    if (typeof file.arrayBuffer === 'function') {
        const buffer = Buffer.from(await file.arrayBuffer());
        return {
            field,
            file: new FileCtor([buffer], filename, { type: mimeType }),
            filename,
            mimeType,
            size: size || buffer.length,
        };
    }
    if (file.data && Buffer.isBuffer(file.data)) {
        return {
            field,
            file: new FileCtor([file.data], filename, { type: mimeType }),
            filename,
            mimeType,
            size: size || file.data.length,
        };
    }

    const error = new Error('图片文件格式无法读取');
    error.code = 400;
    throw error;
}

function validateImageFile(file) {
    if (!file.size) {
        const error = new Error('图片文件为空');
        error.code = 400;
        throw error;
    }
    if (file.size > MAX_IMAGE_SIZE) {
        const error = new Error('图片不能超过 10MB');
        error.code = 400;
        throw error;
    }
    if (!IMAGE_MIME_TYPES.has(file.mimeType)) {
        const error = new Error('仅支持 JPG、PNG、WebP 或 GIF 图片');
        error.code = 400;
        throw error;
    }
}

function resolveAssetUrl(client, record, filename) {
    return getFileUrl(record, filename) || (client?.files?.getURL ? client.files.getURL(record, filename) : '') || filename;
}

function resolveStoredFilename(value, fallback) {
    const stored = Array.isArray(value) ? value[0] : value;
    if (typeof stored === 'string' && stored) {
        return stored;
    }
    if (stored && typeof stored === 'object' && stored.name) {
        return stored.name;
    }
    return fallback;
}

async function ensureRepositoryAuth(repository) {
    if (typeof repository?.client?.ensureAuth === 'function') {
        await repository.client.ensureAuth();
    }
}

function mimeTypeFromFilename(filename) {
    const extension = path.extname(filename).toLowerCase();
    if (extension === '.jpg' || extension === '.jpeg') {
        return 'image/jpeg';
    }
    if (extension === '.webp') {
        return 'image/webp';
    }
    if (extension === '.gif') {
        return 'image/gif';
    }
    return 'image/png';
}

module.exports = {
    OpsRichTextAssetService,
    RICH_TEXT_ASSET_COLLECTION,
};
