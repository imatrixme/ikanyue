#!/usr/bin/env node

const dotenv = require('dotenv');
const { COURSE_CREDIT_COLLECTION_SCHEMAS, validateCourseCreditSchemas } = require('../src/services/courseCredits/schema');
const { applyOpsSchemas, ensureLocalCoreCollections } = require('./lib/points-lite-bootstrap');

dotenv.config({
    path: process.env.KANYUE_ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env'),
});

async function main() {
    const validation = validateCourseCreditSchemas();
    if (!validation.ok) {
        throw new Error(validation.errors.join('\n'));
    }

    const PocketBase = await import('pocketbase');
    const pb = new PocketBase.default(process.env.PB_URL || 'http://127.0.0.1:8090');
    await pb.collection('_superusers').authWithPassword(requiredEnv('PB_EMAIL'), requiredEnv('PB_PASSWORD'));
    const core = await ensureLocalCoreCollections(pb, envFlag('OPS_BOOTSTRAP_CORE_COLLECTIONS'));
    await applyOpsSchemas(pb, COURSE_CREDIT_COLLECTION_SCHEMAS, core);
}

function envFlag(name) {
    return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required to apply course credit schema`);
    return value;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = { envFlag, main, requiredEnv };
