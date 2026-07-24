const { createRecordId, invariant } = require('./domain');
const { normalizeResourceInput, resourceSchema, validateStatus } = require('./adminResourceSchemas');
const {
    commitTeachingPlan,
    create,
    escapeFilter,
    positiveVersion,
    prepareTeachingCommand,
    teachingOperation,
    update,
    versionClaim,
} = require('./teachingCommand');

class AdminResourceCommandService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async createResource(name, input = {}) {
        const config = resourceSchema(name);
        const data = normalizeResourceInput(name, input.data || input);
        if (name === 'lessons') {
            invariant(data.status === 'draft', 'LESSON_MUST_START_DRAFT', '新课堂必须先保存为草稿');
        }
        const id = this.idFactory();
        const plan = [create(config.collection, { id, ...data }), audit(this.idFactory, input, name, id, 'create')];
        await this.repository.send(plan);
        return { id, resource: name, status: data.status || 'active' };
    }

    async updateResource(name, id, input = {}) {
        requiredId(id);
        const config = resourceSchema(name);
        const current = await this.repository.get(config.collection, id);
        if (name === 'lessons') {
            invariant(!['settled', 'correction_pending'].includes(current.status),
                'LESSON_IMMUTABLE_AFTER_SETTLEMENT', '已核销课堂不能直接修改');
        }
        const data = normalizeResourceInput(name, input.data || input, current);
        if (name === 'lessons') {
            validateLessonStatusTransition(current.status, data.status);
            return this.updateLesson(id, current, data, input);
        }
        if (config.revisioned) return this.createRevision(name, current, data, input);
        await this.repository.send([
            update(config.collection, id, data),
            audit(this.idFactory, input, name, id, 'update'),
        ]);
        return { id, resource: name, status: data.status || current.status || 'active' };
    }

    async setStatus(name, id, status, input = {}) {
        validateStatus(name, status);
        if (name === 'packages' && status === 'active') await this.validatePackagePublication(id);
        return this.updateResource(name, id, { ...input, data: { status } });
    }

    async validatePackagePublication(packageId) {
        const [lines, prices] = await Promise.all([
            this.repository.list('package_grant_lines', {
                filter: `packageId="${escapeFilter(packageId)}"`, sort: 'creditTypeId',
            }),
            this.repository.list('price_versions', {
                filter: `packageId="${escapeFilter(packageId)}" && status="active"`, sort: '-version',
            }),
        ]);
        invariant(lines.length > 0, 'PACKAGE_GRANT_LINES_REQUIRED', '课包启用前必须配置课时');
        invariant(prices.length > 0, 'PACKAGE_ACTIVE_PRICE_REQUIRED', '课包启用前必须配置有效价格');
    }

    async createRevision(name, current, data, input) {
        const config = resourceSchema(name);
        const id = this.idFactory();
        const version = Math.max(positiveVersion(current.version) + 1, positiveVersion(data.version));
        const next = { ...data, id, version };
        await this.repository.send([
            create(config.collection, next),
            audit(this.idFactory, input, name, id, 'create_revision', { previousId: current.id, version }),
        ]);
        return { id, previousId: current.id, resource: name, status: next.status, version };
    }

    async updateLesson(id, current, data, input) {
        const command = await prepareTeachingCommand(this, 'updateLesson', input, { id, data });
        if (command.replay) return command.replay;
        const version = positiveVersion(current.version);
        const result = { id, operationId: command.operationId, resource: 'lessons', status: data.status };
        const context = { ...command, input, result };
        return commitTeachingPlan(this, context, [
            teachingOperation({
                ...context,
                type: 'adjust',
                sourceType: 'session',
                sourceId: id,
                requestSnapshot: { id, status: data.status },
            }),
            versionClaim(this.idFactory, 'session', id, version, command.operationId),
            update('sessions', id, { ...data, version: version + 1 }),
            audit(this.idFactory, input, 'lessons', id, 'update'),
        ]);
    }
}

function audit(idFactory, input, resourceType, resourceId, action, metadata = {}) {
    return create('ops_audit_logs', {
        id: idFactory(),
        actorId: input.actorId || '',
        actorRole: input.actorRole || 'admin',
        action: `course_operations.${resourceType}.${action}`,
        resourceType,
        resourceId,
        outcome: 'success',
        metadata,
    });
}

function requiredId(value) {
    invariant(typeof value === 'string' && value, 'ADMIN_RESOURCE_ID_REQUIRED', '资源编号不能为空');
}

function validateLessonStatusTransition(current, next) {
    if (current === next) return;
    const allowed = {
        draft: ['cancelled'],
        scheduled: ['enrollment_closed', 'in_progress', 'cancelled'],
        enrollment_closed: ['in_progress', 'cancelled'],
        in_progress: ['completed', 'cancelled'],
        completed: [],
        cancelled: [],
    };
    invariant((allowed[current] || []).includes(next), 'LESSON_STATUS_TRANSITION_INVALID',
        '课堂状态流转无效；草稿发布必须使用发布命令', { current, next });
}

module.exports = { AdminResourceCommandService, audit, requiredId, validateLessonStatusTransition };
