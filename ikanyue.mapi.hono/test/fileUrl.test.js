const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getFileUrl,
    processActivityFiles,
    processAudioMaterialFiles,
    processBatchFiles,
    processVideoMaterialFiles,
} = require('../src/utils/fileUrl');

function withFileEnv(env, fn) {
    const previous = {
        PB_URL: process.env.PB_URL,
        PUBLIC_ASSET_BASE_URL: process.env.PUBLIC_ASSET_BASE_URL,
        PB_PUBLIC_URL: process.env.PB_PUBLIC_URL,
    };

    Object.entries(env).forEach(([key, value]) => {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    });

    try {
        fn();
    } finally {
        Object.entries(previous).forEach(([key, value]) => {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        });
    }
}

test('getFileUrl handles empty values, absolute URLs, public asset, and PocketBase URLs', () => {
    const record = {
        collectionId: 'materials',
        id: 'material_1',
    };

    assert.equal(getFileUrl(record, ''), '');
    assert.equal(getFileUrl(record, 'https://cdn.example.com/file.mp3'), 'https://cdn.example.com/file.mp3');
    assert.equal(getFileUrl(record, 'http://cdn.example.com/file.mp3'), 'http://cdn.example.com/file.mp3');

    withFileEnv({ PUBLIC_ASSET_BASE_URL: 'https://oss.example.com/assets', PB_URL: 'https://pb.example.com' }, () => {
        assert.equal(
            getFileUrl(record, 'audio.mp3'),
            'https://oss.example.com/assets/materials/material_1/audio.mp3'
        );
    });

    withFileEnv({ PUBLIC_ASSET_BASE_URL: undefined, PB_PUBLIC_URL: undefined, PB_URL: 'https://pb.example.com' }, () => {
        assert.equal(getFileUrl(record, 'audio.mp3'), 'https://pb.example.com/api/files/materials/material_1/audio.mp3');
    });
});

test('processAudioMaterialFiles maps string and object file fields', () => {
    withFileEnv({ S3_URL: undefined, S3_BUCKET: undefined, PB_URL: 'https://pb.example.com' }, () => {
        assert.equal(processAudioMaterialFiles(null), null);

        const processed = processAudioMaterialFiles({
            collectionId: 'audio',
            id: 'audio_1',
            audioSource: { name: 'source.mp3' },
            coverImage: 'cover.jpg',
        });

        assert.equal(processed.audioSourceUrl, 'https://pb.example.com/api/files/audio/audio_1/source.mp3');
        assert.equal(processed.coverImageUrl, 'https://pb.example.com/api/files/audio/audio_1/cover.jpg');

        const fallbackObject = processAudioMaterialFiles({
            collectionId: 'audio',
            id: 'audio_2',
            audioSource: { id: 'file_object' },
            coverImage: { name: 'cover-2.jpg' },
        });

        assert.equal(fallbackObject.audioSourceUrl, '');
        assert.equal(fallbackObject.coverImageUrl, 'https://pb.example.com/api/files/audio/audio_2/cover-2.jpg');
    });
});

test('processVideoMaterialFiles maps source, cover, and thumbnail URLs', () => {
    withFileEnv({ S3_URL: undefined, S3_BUCKET: undefined, PB_URL: 'https://pb.example.com' }, () => {
        assert.equal(processVideoMaterialFiles(undefined), undefined);

        const processed = processVideoMaterialFiles({
            collectionId: 'video',
            id: 'video_1',
            videoSource: 'video.mp4',
            coverImage: 'cover.jpg',
            thumbnail: 'thumb.jpg',
        });

        assert.deepEqual(
            {
                videoSourceUrl: processed.videoSourceUrl,
                coverImageUrl: processed.coverImageUrl,
                thumbnailUrl: processed.thumbnailUrl,
            },
            {
                videoSourceUrl: 'https://pb.example.com/api/files/video/video_1/video.mp4',
                coverImageUrl: 'https://pb.example.com/api/files/video/video_1/cover.jpg',
                thumbnailUrl: 'https://pb.example.com/api/files/video/video_1/thumb.jpg',
            }
        );
    });
});

test('processActivityFiles maps cover and image collections', () => {
    withFileEnv({ S3_URL: undefined, S3_BUCKET: undefined, PB_URL: 'https://pb.example.com' }, () => {
        assert.equal(processActivityFiles(false), false);

        const processed = processActivityFiles({
            collectionId: 'activities',
            id: 'activity_1',
            coverImage: 'cover.jpg',
            images: ['one.jpg', 'two.jpg'],
        });

        assert.equal(processed.coverImageUrl, 'https://pb.example.com/api/files/activities/activity_1/cover.jpg');
        assert.deepEqual(processed.imageUrls, [
            'https://pb.example.com/api/files/activities/activity_1/one.jpg',
            'https://pb.example.com/api/files/activities/activity_1/two.jpg',
        ]);

        const withoutImages = processActivityFiles({
            collectionId: 'activities',
            id: 'activity_2',
            images: [],
        });
        assert.equal('imageUrls' in withoutImages, false);
    });
});

test('processBatchFiles only maps arrays', () => {
    const processor = (record) => ({ ...record, processed: true });

    assert.equal(processBatchFiles(null, processor), null);
    assert.deepEqual(processBatchFiles([{ id: 'record_1' }], processor), [{ id: 'record_1', processed: true }]);
});
