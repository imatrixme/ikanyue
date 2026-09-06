const dotenv = require('dotenv');
const { applyOpsSchemas } = require('./lib/points-lite-bootstrap');
const { COMMERCE_SCHEMA } = require('../src/services/commerce/schema');
dotenv.config({ path: process.env.KANYUE_ENV_FILE || '.env' });

async function main() {
    if (!process.env.PB_URL || !process.env.PB_EMAIL || !process.env.PB_PASSWORD) throw new Error('Explicit business PB credentials required');
    const PocketBase = (await import('pocketbase')).default;
    const pb = new PocketBase(process.env.PB_URL);
    await pb.collection('_superusers').authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
    await applyOpsSchemas(pb, COMMERCE_SCHEMA);
    await pb.settings.update({ batch: { enabled: true, maxRequests: 100, timeout: 10, maxBodySize: 1048576 } });
    console.log('Business commerce schema ready. No sales or policies published.');
}
if (require.main === module) main().catch(() => { console.error('Commerce schema initialization failed.'); process.exitCode = 1; });
module.exports = { main };
