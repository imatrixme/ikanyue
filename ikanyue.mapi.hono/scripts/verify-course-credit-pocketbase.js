#!/usr/bin/env node

const { assertPocketBaseBatchCapability } = require('../src/services/courseCredits/pocketBaseCapabilities');

const REQUIRED_COLLECTIONS = [
    'course_specs',
    'credit_types',
    'packages',
    'orders',
    'credit_operations',
    'credit_version_claims',
    'credit_batches',
    'credit_events',
    'conversion_rules',
    'conversion_authorizations',
    'classes',
    'sessions',
    'outbox_events',
    'reconciliation_runs',
    'reconciliation_exceptions',
];

async function main(options = {}) {
    const env = options.env || process.env;
    const url = env.PB_URL || 'http://127.0.0.1:18091';
    assertLoopbackPocketBase(url);
    const email = requiredEnv('PB_EMAIL', env);
    const password = requiredEnv('PB_PASSWORD', env);
    let pb = options.pb;
    if (!pb) {
        const PocketBase = await (options.loadPocketBase || (() => import('pocketbase')))();
        pb = new PocketBase.default(url);
    }
    await pb.collection('_superusers').authWithPassword(email, password);
    const result = await verifyCourseCreditPocketBase({ pb, now: options.now || Date.now });
    (options.log || console.log)(JSON.stringify(result));
    return result;
}

async function verifyCourseCreditPocketBase({ pb, now }) {
    const collections = await pb.collections.getFullList({ perPage: 500, requestKey: null });
    const byName = new Map(collections.map((collection) => [collection.name, collection]));
    for (const name of REQUIRED_COLLECTIONS) {
        if (!byName.has(name)) throw new Error(`Missing migrated collection ${name}`);
    }
    const defaultCreditType = byName.get('course_specs').fields.find((field) => field.name === 'defaultCreditTypeId');
    if (!defaultCreditType?.collectionId) {
        throw new Error('course_specs.defaultCreditTypeId relation was not migrated');
    }

    const capability = await assertPocketBaseBatchCapability(pb);
    const marker = now().toString(36);
    const rollbackScope = `course-credit-sdk-batch-rollback-${marker}`;
    const failedBatch = pb.createBatch();
    failedBatch.collection('reconciliation_runs').create({
        scope: rollbackScope,
        status: 'pending',
        differenceCount: 0,
    });
    failedBatch.collection('outbox_events').create({
        aggregateType: 'probe',
        aggregateId: marker,
        payload: { probe: true },
        status: 'pending',
        attempts: 0,
    });
    let rollbackFailureObserved = false;
    try {
        await failedBatch.send({ requestKey: null });
    } catch (error) {
        if (error?.status !== 400) throw error;
        rollbackFailureObserved = true;
    }
    if (!rollbackFailureObserved) throw new Error('SDK batch rollback probe did not reject the invalid write');
    const residue = await pb.collection('reconciliation_runs').getList(1, 1, {
        filter: `scope="${rollbackScope}"`,
        requestKey: null,
    });
    if (residue.totalItems !== 0) throw new Error('SDK batch rollback probe left reconciliation records behind');

    const successScope = `course-credit-sdk-batch-success-${marker}`;
    const successfulBatch = pb.createBatch();
    successfulBatch.collection('reconciliation_runs').create({
        scope: successScope,
        status: 'pending',
        differenceCount: 0,
    });
    successfulBatch.collection('outbox_events').create({
        topic: 'course-credit.batch-probe',
        aggregateType: 'probe',
        aggregateId: marker,
        payload: { probe: true },
        status: 'pending',
        attempts: 0,
    });
    const successfulResult = await successfulBatch.send({ requestKey: null });
    const createdRecords = successfulResult.map((entry) => entry?.body).filter(Boolean);
    if (createdRecords.length !== 2 || createdRecords.some((record) => !record.id)) {
        throw new Error('SDK batch success probe returned an incomplete result');
    }
    await pb.collection('outbox_events').delete(createdRecords[1].id, { requestKey: null });
    await pb.collection('reconciliation_runs').delete(createdRecords[0].id, { requestKey: null });

    return {
        batch: capability,
        collectionsVerified: REQUIRED_COLLECTIONS.length,
        sdkBatchCommit: true,
        sdkBatchRollback: true,
        transactionProbeResidue: 0,
    };
}

function assertLoopbackPocketBase(value) {
    const url = new URL(value);
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) {
        throw new Error(`Refusing to mutate non-loopback PocketBase host ${url.hostname}`);
    }
}

function requiredEnv(name, env = process.env) {
    const value = env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    REQUIRED_COLLECTIONS,
    assertLoopbackPocketBase,
    main,
    requiredEnv,
    verifyCourseCreditPocketBase,
};
