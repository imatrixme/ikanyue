class AuditService {
    constructor(repository) {
        this.repository = repository;
    }

    async record({ actor, action, resourceType, resourceId = '', outcome = 'allowed', metadata = {} }) {
        const payload = {
            actorId: actor?.id || '',
            actorRole: actor?.role || 'anonymous',
            actorIsAdmin: Boolean(actor?.isAdmin),
            action,
            resourceType,
            resourceId,
            outcome,
            metadata,
            createdAt: new Date().toISOString(),
        };

        try {
            return await this.repository.create('ops_audit_logs', payload);
        } catch (error) {
            console.error('记录运营审计日志失败:', error.message);
            return payload;
        }
    }

    async denied(actor, action, resourceType, resourceId = '', metadata = {}) {
        return this.record({
            actor,
            action,
            resourceType,
            resourceId,
            outcome: 'denied',
            metadata,
        });
    }
}

module.exports = { AuditService };
