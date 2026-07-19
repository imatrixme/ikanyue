const pbClient = require('../../utils/pocketbase');
const { assertPocketBaseBatchCapability } = require('./pocketBaseCapabilities');

async function verifyCourseCreditStorageAtStartup(client = pbClient) {
    await client.ready;
    await client.ensureAuth();
    return assertPocketBaseBatchCapability(client.getClient());
}

module.exports = { verifyCourseCreditStorageAtStartup };
