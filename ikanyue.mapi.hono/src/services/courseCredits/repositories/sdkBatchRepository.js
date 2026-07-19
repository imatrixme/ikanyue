const { invariant } = require('../domain/errors');
const {
    APPEND_ONLY_COURSE_CREDIT_COLLECTIONS,
    VERSIONED_COURSE_CREDIT_COLLECTIONS,
} = require('../schema');

const ACTIONS = new Set(['create', 'update', 'upsert', 'delete']);
const VERSIONED_ENTITY_TYPES = new Map([
    ['credit_batches', 'credit_batch'],
    ['orders', 'order'],
    ['session_students', 'session_student'],
    ['sessions', 'session'],
]);

class PocketBaseBatchRepository {
    constructor(client) {
        this.client = client;
    }

    async get(collection, id, options = {}) {
        return this.client.collection(collection).getOne(id, requestOptions(options));
    }

    async list(collection, options = {}) {
        return this.client.collection(collection).getFullList(requestOptions(options));
    }

    async page(collection, page = 1, perPage = 20, options = {}) {
        return this.client.collection(collection).getList(page, perPage, requestOptions(options));
    }

    async findFirst(collection, filter, options = {}) {
        try {
            return await this.client.collection(collection).getFirstListItem(filter, requestOptions(options));
        } catch (error) {
            if (error?.status === 404) return null;
            throw error;
        }
    }

    async send(plan) {
        invariant(Array.isArray(plan) && plan.length > 0,
            'EMPTY_BATCH_PLAN', 'PocketBase batch plan cannot be empty');
        assertBatchPlanPolicy(plan);
        const batch = this.client.createBatch();
        for (const request of plan) queueRequest(batch, request);
        const response = await batch.send({ requestKey: null });
        return response.map((entry) => entry?.body ?? entry);
    }
}

function assertBatchPlanPolicy(plan) {
    const claims = new Set(plan
        .filter((request) => request.action === 'create' && request.collection === 'credit_version_claims')
        .map((request) => claimKey(request.data)));

    for (const request of plan) {
        if (APPEND_ONLY_COURSE_CREDIT_COLLECTIONS.has(request.collection)) {
            invariant(request.action === 'create', 'APPEND_ONLY_COLLECTION_MUTATION',
                'Append-only course-credit records can only be created', {
                    action: request.action,
                    collection: request.collection,
                });
        }
        if (VERSIONED_COURSE_CREDIT_COLLECTIONS.has(request.collection)) {
            invariant(request.action === 'create', 'VERSIONED_RECORD_MUTATION_FORBIDDEN',
                'Versioned course-credit records are create-only', {
                    action: request.action,
                    collection: request.collection,
                });
        }
        const entityType = VERSIONED_ENTITY_TYPES.get(request.collection);
        if (!entityType) continue;
        invariant(request.action !== 'delete', 'VERSIONED_ENTITY_DELETE_FORBIDDEN',
            'Versioned course-credit records cannot be deleted', { collection: request.collection });
        invariant(request.action !== 'upsert', 'VERSIONED_ENTITY_UPSERT_FORBIDDEN',
            'Versioned course-credit records cannot be upserted', { collection: request.collection });
        if (request.action !== 'update') continue;
        const nextVersion = Number(request.data?.version);
        invariant(Number.isInteger(nextVersion) && nextVersion > 1,
            'VERSION_INCREMENT_REQUIRED', 'Versioned updates require the next positive version', {
                collection: request.collection,
                id: request.id,
            });
        invariant(claims.has(`${entityType}:${request.id}:${nextVersion - 1}`),
            'VERSION_CLAIM_REQUIRED', 'Versioned updates require a matching claim in the same batch', {
                collection: request.collection,
                expectedVersion: nextVersion - 1,
                id: request.id,
            });
    }
}

function claimKey(data = {}) {
    return `${data.entityType}:${data.entityId}:${Number(data.expectedVersion)}`;
}

function queueRequest(batch, request) {
    invariant(request && ACTIONS.has(request.action),
        'INVALID_BATCH_ACTION', 'PocketBase batch action is invalid', { action: request?.action });
    invariant(typeof request.collection === 'string' && request.collection,
        'INVALID_BATCH_COLLECTION', 'PocketBase batch collection is required');
    const collection = batch.collection(request.collection);
    if (request.action === 'create' || request.action === 'upsert') {
        collection[request.action](request.data || {}, requestOptions(request.options));
        return;
    }
    invariant(typeof request.id === 'string' && request.id,
        'INVALID_BATCH_RECORD_ID', 'PocketBase batch update and delete require a record id');
    if (request.action === 'update') {
        collection.update(request.id, request.data || {}, requestOptions(request.options));
        return;
    }
    collection.delete(request.id, requestOptions(request.options));
}

function requestOptions(options = {}) {
    return { ...options, requestKey: null };
}

module.exports = {
    PocketBaseBatchRepository,
    VERSIONED_ENTITY_TYPES,
    assertBatchPlanPolicy,
    claimKey,
    queueRequest,
    requestOptions,
};
