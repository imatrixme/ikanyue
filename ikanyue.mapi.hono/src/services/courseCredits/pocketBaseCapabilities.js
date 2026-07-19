const { invariant } = require('./domain/errors');

async function assertPocketBaseBatchCapability(client) {
    invariant(client && typeof client.createBatch === 'function',
        'POCKETBASE_BATCH_UNSUPPORTED', 'PocketBase JavaScript SDK Batch API is unavailable');
    invariant(client.settings && typeof client.settings.getAll === 'function',
        'POCKETBASE_SETTINGS_UNAVAILABLE', 'PocketBase settings API is unavailable');
    const settings = await client.settings.getAll({ requestKey: null });
    return assertBatchSettings(settings?.batch);
}

function assertBatchSettings(batch) {
    invariant(batch?.enabled === true,
        'POCKETBASE_BATCH_DISABLED', 'PocketBase Batch API must be enabled');
    return {
        enabled: true,
        maxBodySize: Number(batch.maxBodySize),
        maxRequests: Number(batch.maxRequests),
        timeout: Number(batch.timeout),
    };
}

module.exports = {
    assertBatchSettings,
    assertPocketBaseBatchCapability,
};
