const assert = require('node:assert/strict');

async function connectLocalPocketBase() {
    const url = process.env.PB_URL;
    const email = process.env.PB_EMAIL;
    const password = process.env.PB_PASSWORD;
    assert.ok(url && email && password, 'PB_URL, PB_EMAIL, and PB_PASSWORD are required');
    assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname),
        'integration tests only accept loopback PocketBase');
    const PocketBase = await import('pocketbase');
    const pb = new PocketBase.default(url);
    await pb.collection('_superusers').authWithPassword(email, password, { requestKey: null });
    return pb;
}

function integrationMarker(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function deleteByFilter(pb, collection, filter) {
    const records = await pb.collection(collection).getFullList({ filter, requestKey: null });
    for (const record of records) await deleteOne(pb, collection, record.id);
}

async function deleteOne(pb, collection, id) {
    if (!id) return;
    try {
        await pb.collection(collection).delete(id, { requestKey: null });
    } catch (error) {
        if (error?.status !== 404) throw error;
    }
}

module.exports = {
    connectLocalPocketBase,
    deleteByFilter,
    deleteOne,
    integrationMarker,
};
