const pbClient = require('../../utils/pocketbase');
const { OPS_COLLECTION_SCHEMAS } = require('../ops/schema');
const { CourseCreditError } = require('./domain');
const { assertPocketBaseBatchCapability } = require('./pocketBaseCapabilities');
const { COURSE_CREDIT_COLLECTION_SCHEMAS } = require('./schema');
const { MAX_BATCH_PLAN_REQUESTS } = require('./repositories/sdkBatchRepository');

const REQUIRED_STORAGE_COLLECTIONS = [...new Set([
    ...OPS_COLLECTION_SCHEMAS,
    ...COURSE_CREDIT_COLLECTION_SCHEMAS,
].map((schema) => schema.name))].sort();

async function verifyCourseCreditStorageAtStartup(client = pbClient) {
    await client.ready;
    await client.ensureAuth();
    const pocketBase = client.getClient();
    const settings = await assertPocketBaseBatchCapability(pocketBase);
    if (!(settings.maxRequests >= MAX_BATCH_PLAN_REQUESTS)) {
        throw new CourseCreditError('POCKETBASE_BATCH_CAPACITY_LOW',
            `PocketBase batch maxRequests must be at least ${MAX_BATCH_PLAN_REQUESTS}; apply pb_migrations`,
            { maxRequests: settings.maxRequests });
    }
    await assertRequiredStorageCollections(pocketBase);
    if (process.env.COURSE_COMMERCE_ENABLED === 'true') {
        await assertRequiredStorageCollections(pocketBase, require('../commerce/schema').COMMERCE_SCHEMA.map((schema) => schema.name));
    }
    return settings;
}

async function assertRequiredStorageCollections(client, required = REQUIRED_STORAGE_COLLECTIONS) {
    if (!client?.collections?.getFullList) {
        throw new CourseCreditError(
            'POCKETBASE_COLLECTIONS_UNAVAILABLE',
            'PocketBase collection administration API is unavailable during startup'
        );
    }

    const collections = await client.collections.getFullList({ requestKey: null });
    const existing = new Set(collections.map((collection) => collection.name));
    const missing = required.filter((name) => !existing.has(name));
    if (missing.length) {
        throw new CourseCreditError(
            'POCKETBASE_COLLECTIONS_MISSING',
            `PocketBase is missing required collections: ${missing.join(', ')}`,
            { missing }
        );
    }
    return existing;
}

module.exports = {
    REQUIRED_STORAGE_COLLECTIONS,
    assertRequiredStorageCollections,
    verifyCourseCreditStorageAtStartup,
};
