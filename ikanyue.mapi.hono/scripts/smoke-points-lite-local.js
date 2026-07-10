#!/usr/bin/env node

const dotenv = require('dotenv');

dotenv.config({ path: process.env.KANYUE_ENV_FILE || '.env' });

async function main() {
    const baseUrl = trimSlash(process.env.LOCAL_HONO_URL || 'http://127.0.0.1:1337');
    assertLocalUrl(baseUrl);

    const admin = await request(baseUrl, '/ops/auth/login', {
        method: 'POST',
        body: {
            account: requiredEnv('OPS_BOOTSTRAP_ADMIN_USERNAME'),
            password: requiredEnv('OPS_BOOTSTRAP_ADMIN_PASSWORD'),
        },
    });
    const adminToken = admin.token;
    assert(adminToken, 'admin login did not return a token');

    const students = await request(baseUrl, '/ops/points/students', { token: adminToken });
    const student = students.items?.find((item) => item.id === 'localstudent001');
    assert(student, 'local seed student was not returned');

    const rewards = await request(baseUrl, '/ops/reward-items', { token: adminToken });
    const reward = rewards.items?.find((item) => item.id === 'localreward0001');
    assert(reward?.pointsPrice === 50, 'local seed reward was not returned with the expected price');

    const imageForm = new FormData();
    imageForm.set('imageFile', new File([
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], 'local-reward.png', { type: 'image/png' }));
    const uploadedReward = await request(baseUrl, `/ops/reward-items/${reward.id}/image`, {
        method: 'POST',
        token: adminToken,
        formData: imageForm,
    });
    assert(uploadedReward.image, 'reward image upload did not return a preview URL');
    assert(
        uploadedReward.image.startsWith(expectedAssetBase()),
        `reward image URL did not use the configured public asset base: ${uploadedReward.image}`
    );

    const before = await request(baseUrl, `/ops/points/students/${student.id}`, { token: adminToken });
    await request(baseUrl, `/ops/points/students/${student.id}/earn`, {
        method: 'POST',
        token: adminToken,
        body: { amount: reward.pointsPrice, reason: 'local_smoke', remark: '本地联调加分' },
    });
    const redeemed = await request(baseUrl, '/ops/points/offline-redeem', {
        method: 'POST',
        token: adminToken,
        body: { studentId: student.id, itemId: reward.id, remark: '本地联调兑换' },
    });
    assert(redeemed.balance === before.balance, 'add and redeem smoke flow did not restore the starting balance');

    const learner = await request(baseUrl, '/v1/user/login', {
        method: 'POST',
        form: {
            cellphone: student.cellphone,
            password: requiredEnv('LOCAL_STUDENT_PASSWORD'),
        },
    });
    assert(learner.token, 'student login did not return a token');

    const availability = await request(baseUrl, '/v1/reward-items', {
        headers: { token: learner.token },
    });
    assert(availability.currentPoints === before.balance, 'student reward availability returned a stale balance');
    assert(availability.redeemableItems?.some((item) => item.id === reward.id), 'seed reward should be redeemable');
    assert(availability.lockedItems?.some((item) => item.id === 'localreward0002'), 'seed workbook should remain locked');

    console.log('local points-lite smoke passed');
}

async function request(baseUrl, path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.token) {
        headers.authorization = `Bearer ${options.token}`;
    }
    let body;
    if (options.formData) {
        body = options.formData;
    } else if (options.form) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(options.form).toString();
    } else if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.body);
    }
    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body,
    });
    const payload = await response.json();
    if (!response.ok || payload.code !== 10000) {
        throw new Error(`${options.method || 'GET'} ${path} failed: ${payload.message || response.status}`);
    }
    return payload.data;
}

function assert(value, message) {
    if (!value) {
        throw new Error(message);
    }
}

function assertLocalUrl(value) {
    const url = new URL(value);
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        throw new Error(`Refusing to run destructive smoke against non-local host: ${url.hostname}`);
    }
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required for local smoke`);
    }
    return value;
}

function trimSlash(value) {
    return value.replace(/\/+$/, '');
}

function expectedAssetBase() {
    const publicBase = trimSlash(process.env.PUBLIC_ASSET_BASE_URL || '');
    if (publicBase) {
        return `${publicBase}/`;
    }
    const pocketBase = trimSlash(process.env.PB_PUBLIC_URL || process.env.PB_URL || 'http://127.0.0.1:8090');
    return `${pocketBase}/api/files/`;
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
