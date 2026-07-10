#!/usr/bin/env node

const dotenv = require('dotenv');
const { OPS_COLLECTION_SCHEMAS, validateOpsSchemas } = require('../src/services/ops/schema');
const {
    applyOpsSchemas,
    ensureBootstrapAdmin,
    ensureLocalCoreCollections,
    ensureTeacherOpsFields,
} = require('./lib/points-lite-bootstrap');

dotenv.config({
    path: process.env.KANYUE_ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env'),
});

async function main() {
    const check = validateOpsSchemas();
    if (!check.ok) {
        throw new Error(check.errors.join('\n'));
    }

    const url = process.env.PB_URL || 'http://127.0.0.1:8090';
    const email = requiredEnv('PB_EMAIL');
    const password = requiredEnv('PB_PASSWORD');
    const PocketBase = await import('pocketbase');
    const pb = new PocketBase.default(url);
    await pb.collection('_superusers').authWithPassword(email, password);

    let byName = await ensureLocalCoreCollections(pb, envFlag('OPS_BOOTSTRAP_CORE_COLLECTIONS'));
    byName = await applyOpsSchemas(pb, OPS_COLLECTION_SCHEMAS, byName);
    await ensureTeacherOpsFields(pb, byName);
    await ensureBootstrapAdmin(pb, {
        enabled: envFlag('OPS_BOOTSTRAP_ADMIN_ENABLED'),
        username: process.env.OPS_BOOTSTRAP_ADMIN_USERNAME,
        email: process.env.OPS_BOOTSTRAP_ADMIN_EMAIL,
        password: process.env.OPS_BOOTSTRAP_ADMIN_PASSWORD,
        cellphone: process.env.OPS_BOOTSTRAP_ADMIN_CELLPHONE,
        displayName: process.env.OPS_BOOTSTRAP_ADMIN_NAME,
        passwordChangeRequired: envFlag('OPS_BOOTSTRAP_ADMIN_FORCE_PASSWORD_CHANGE'),
    });
}

function envFlag(name) {
    return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required to apply ops schema`);
    }
    return value;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = { envFlag, main, requiredEnv };
