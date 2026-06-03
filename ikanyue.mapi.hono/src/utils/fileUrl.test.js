const assert = require('node:assert/strict');
const test = require('node:test');

const { getFileUrl } = require('./fileUrl');

const RECORD = {
    id: 'activity_1',
    collectionId: 'activities',
};

const ENV_KEYS = ['PUBLIC_ASSET_BASE_URL', 'PB_PUBLIC_URL', 'PB_URL', 'S3_URL', 'S3_BUCKET'];

function withEnv(env, fn) {
    const original = {};
    for (const key of ENV_KEYS) {
        original[key] = process.env[key];
        delete process.env[key];
    }

    Object.assign(process.env, env);

    try {
        fn();
    } finally {
        for (const key of ENV_KEYS) {
            if (original[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = original[key];
            }
        }
    }
}

test('uses the public asset base URL without bucket credentials', () => {
    withEnv({ PUBLIC_ASSET_BASE_URL: 'https://kyoss.abcmem.com/' }, () => {
        assert.equal(
            getFileUrl(RECORD, 'cover.jpg'),
            'https://kyoss.abcmem.com/activities/activity_1/cover.jpg'
        );
    });
});

test('falls back to the public PocketBase file endpoint', () => {
    withEnv({ PB_PUBLIC_URL: 'https://data.ikanyue.com' }, () => {
        assert.equal(
            getFileUrl(RECORD, 'cover.jpg'),
            'https://data.ikanyue.com/api/files/activities/activity_1/cover.jpg'
        );
    });
});

test('keeps already absolute file URLs unchanged', () => {
    withEnv({ PUBLIC_ASSET_BASE_URL: 'https://kyoss.abcmem.com' }, () => {
        assert.equal(
            getFileUrl(RECORD, 'https://example.com/cover.jpg'),
            'https://example.com/cover.jpg'
        );
    });
});

test('does not use legacy S3 bucket variables', () => {
    withEnv({ S3_URL: 'https://s3.example.com', S3_BUCKET: 'bucket' }, () => {
        assert.equal(getFileUrl(RECORD, 'cover.jpg'), '');
    });
});
