const test = require('node:test');
const assert = require('node:assert/strict');

const {
    activityFindModulePath,
    audioMaterialFindModulePath,
    createCollectionMock,
    createRouteApp,
    requestJson,
    videoMaterialFindModulePath,
    withEnv,
    withMockedFindRouteModule,
} = require('./support/pageRouteTestHelpers');

test('activity find route supports miniapp list params and detail requests', async () => {
    await withEnv({ PB_URL: 'https://pb.example.com', S3_BUCKET: undefined, S3_URL: undefined }, async () => {
        const calls = [];
        const pocketbaseMock = createCollectionMock({
            activities: {
                async getList(page, limit, options) {
                    calls.push({ page, limit, options });
                    return {
                        items: [
                            {
                                collectionId: 'activities',
                                id: 'activity_1',
                                title: '公开课',
                                coverImage: 'cover.jpg',
                                images: ['one.jpg'],
                            },
                        ],
                        totalItems: 1,
                        totalPages: 1,
                        page,
                        perPage: limit,
                    };
                },
                async getOne(id) {
                    assert.equal(id, 'activity_1');
                    return { collectionId: 'activities', id, title: '公开课', coverImage: 'cover.jpg', status: 'active' };
                },
            },
        });

        await withMockedFindRouteModule(activityFindModulePath, 'activityFindHandler', pocketbaseMock, async (activityFindHandler) => {
            const app = createRouteApp('/v1/activity/find', 'get', activityFindHandler);
            const listPayload = await requestJson(
                app,
                '/v1/activity/find?perPage=100&status=active&tags=声乐,体验&type=lesson&location=上海&start_time_gte=2026-01-01T00%3A00%3A00.000Z&start_time_lte=2026-12-31T23%3A59%3A59.999Z&sort=-sequence'
            );

            assert.equal(listPayload.code, 10000);
            assert.equal(calls[0].page, 1);
            assert.equal(calls[0].limit, 100);
            assert.equal(calls[0].options.sort, '-sequence');
            assert.match(calls[0].options.filter, /status = "active"/);
            assert.match(calls[0].options.filter, /tags ~ "声乐"/);
            assert.match(calls[0].options.filter, /tags ~ "体验"/);
            assert.match(calls[0].options.filter, /startTime >= "2026-01-01T00:00:00.000Z"/);
            assert.match(calls[0].options.filter, /startTime <= "2026-12-31T23:59:59.999Z"/);
            assert.equal(listPayload.data.items[0].coverImageUrl, 'https://pb.example.com/api/files/activities/activity_1/cover.jpg');

            const detailPayload = await requestJson(app, '/v1/activity/find?id=activity_1');
            assert.equal(detailPayload.code, 10000);
            assert.equal(detailPayload.data.id, 'activity_1');
        });
    });
});

test('activity find route covers miniapp validation and failure flows', async () => {
    const pocketbaseMock = createFindCollectionMock('activities', 'missing', 'list failed', 'detail failed');

    await withMockedFindRouteModule(activityFindModulePath, 'activityFindHandler', pocketbaseMock, async (activityFindHandler) => {
        const app = createRouteApp('/v1/activity/find', 'get', activityFindHandler);

        assert.equal((await requestJson(app, '/v1/activity/find?page=0')).code, 400);
        assert.equal((await requestJson(app, '/v1/activity/find?perPage=101')).code, 400);
        assert.equal((await requestJson(app, '/v1/activity/find?id=missing')).code, 404);
        assert.equal((await requestJson(app, '/v1/activity/find?id=broken')).code, 500);
        assert.equal((await requestJson(app, '/v1/activity/find?page=9')).code, 500);
    });
});

test('activity find route only exposes published activities and matches values literally', async () => {
    const calls = [];
    const pocketbaseMock = createCollectionMock({
        activities: {
            async getList(page, limit, options) {
                calls.push(options);
                return { items: [], totalItems: 0, totalPages: 0, page, perPage: limit };
            },
            async getOne(id) {
                return { collectionId: 'activities', id, status: 'draft' };
            },
        },
    });

    await withMockedFindRouteModule(activityFindModulePath, 'activityFindHandler', pocketbaseMock, async (activityFindHandler) => {
        const app = createRouteApp('/v1/activity/find', 'get', activityFindHandler);
        const injection = encodeURIComponent('x" || @collection.users.password ~ "a');

        assert.equal((await requestJson(app, `/v1/activity/find?status=all&type=${injection}&location=${injection}&tags=${injection}&sort=password`)).code, 10000);
        const literal = String.raw`"x\" || @collection.users.password ~ \"a"`;
        assert.equal(calls[0].filter,
            `status = "active" && tags ~ ${literal} && type = ${literal} && location ~ ${literal}`);
        assert.equal(calls[0].sort, '-created');

        assert.equal((await requestJson(app, `/v1/activity/find?start_time_gte=${injection}`)).code, 400);
        assert.equal((await requestJson(app, '/v1/activity/find?sort=-startTime,sequence')).code, 10000);
        assert.equal(calls[1].sort, '-startTime,sequence');
        assert.equal((await requestJson(app, '/v1/activity/find?id=draft_1')).code, 404);
    });
});

test('audio material find route supports miniapp list, detail, and POST form params', async () => {
    await withEnv({ PB_URL: 'https://pb.example.com', S3_BUCKET: undefined, S3_URL: undefined }, async () => {
        const calls = [];
        const pocketbaseMock = createMaterialCollectionMock('audio_materials', calls, {
            id: 'audio_1',
            audioSource: 'source.mp3',
            coverImage: 'cover.jpg',
        });

        await withMockedFindRouteModule(
            audioMaterialFindModulePath,
            'audioMaterialFindHandler',
            pocketbaseMock,
            async (audioMaterialFindHandler) => {
                const app = createRouteApp('/v1/audioMaterial/find', 'get', audioMaterialFindHandler);
                app.post('/v1/audioMaterial/find', audioMaterialFindHandler);

                const listPayload = await requestJson(
                    app,
                    '/v1/audioMaterial/find?perPage=20&status=published&type=warmup&language=zh&difficulty=2&title=声乐&author=王老师&tags=基础'
                );
                assert.equal(listPayload.code, 10000);
                assert.equal(calls[0].limit, '20');
                assert.match(calls[0].options.filter, /status = "published"/);
                assert.match(calls[0].options.filter, /difficulty = 2/);
                assert.equal(listPayload.data.items[0].audioSourceUrl, 'https://pb.example.com/api/files/audio_materials/audio_1/source.mp3');

                const detailPayload = await requestJson(app, '/v1/audioMaterial/find?id=audio_1');
                assert.equal(detailPayload.data.audioSourceUrl, 'https://pb.example.com/api/files/audio_materials/audio_1/source.mp3');

                await app.request('/v1/audioMaterial/find?status=published', {
                    method: 'POST',
                    headers: { 'content-type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ perPage: '5', status: 'all' }),
                });
                assert.equal(calls[1].limit, '5');
                assert.equal(calls[1].options.filter, '');
            }
        );
    });
});

test('audio material find route covers validation and lookup failures', async () => {
    const pocketbaseMock = createFindCollectionMock('audio_materials', 'missing', 'audio list failed', 'audio detail failed');

    await withMockedFindRouteModule(
        audioMaterialFindModulePath,
        'audioMaterialFindHandler',
        pocketbaseMock,
        async (audioMaterialFindHandler) => {
            const app = createRouteApp('/v1/audioMaterial/find', 'get', audioMaterialFindHandler);
            app.post('/v1/audioMaterial/find', audioMaterialFindHandler);
            app.put('/v1/audioMaterial/find', audioMaterialFindHandler);

            assert.equal((await requestJson(app, '/v1/audioMaterial/find?page=0')).code, 400);
            assert.equal((await requestJson(app, '/v1/audioMaterial/find?perPage=101')).code, 400);
            assert.equal((await requestJson(app, '/v1/audioMaterial/find?id=missing')).code, 404);
            assert.equal((await requestJson(app, '/v1/audioMaterial/find?id=broken')).code, 500);
            assert.equal((await requestJson(app, '/v1/audioMaterial/find?page=9')).code, 500);
            assert.equal((await requestJson(app, '/v1/audioMaterial/find?status=all&difficulty=bad', { method: 'PUT' })).code, 10000);
        }
    );
});

test('video material find route supports miniapp list, detail, and POST params', async () => {
    await withEnv({ PB_URL: 'https://pb.example.com', S3_BUCKET: undefined, S3_URL: undefined }, async () => {
        const calls = [];
        const pocketbaseMock = createMaterialCollectionMock('video_materials', calls, {
            id: 'video_1',
            videoSource: 'video.mp4',
            coverImage: 'cover.jpg',
            thumbnail: 'thumb.jpg',
        });

        await withMockedFindRouteModule(
            videoMaterialFindModulePath,
            'videoMaterialFindHandler',
            pocketbaseMock,
            async (videoMaterialFindHandler) => {
                const app = createRouteApp('/v1/videoMaterial/find', 'get', videoMaterialFindHandler);
                app.post('/v1/videoMaterial/find', videoMaterialFindHandler);

                const listPayload = await requestJson(
                    app,
                    '/v1/videoMaterial/find?perPage=20&status=published&type=lesson&language=zh&difficulty=3&resolution=1080p&author=王老师&tags=基础,演出'
                );
                assert.equal(listPayload.code, 10000);
                assert.equal(calls[0].limit, '20');
                assert.match(calls[0].options.filter, /difficulty = 3/);
                assert.match(calls[0].options.filter, /resolution = "1080p"/);
                assert.equal(listPayload.data.items[0].videoSourceUrl, 'https://pb.example.com/api/files/video_materials/video_1/video.mp4');

                const detailPayload = await requestJson(app, '/v1/videoMaterial/find?id=video_1');
                assert.equal(detailPayload.data.thumbnailUrl, 'https://pb.example.com/api/files/video_materials/video_1/thumb.jpg');

                await app.request('/v1/videoMaterial/find?status=published', {
                    method: 'POST',
                    headers: { 'content-type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ perPage: '6', status: 'all' }),
                });
                assert.equal(calls[1].limit, '6');
                assert.equal(calls[1].options.filter, '');
            }
        );
    });
});

test('video material find route covers validation and lookup failures', async () => {
    const pocketbaseMock = createFindCollectionMock('video_materials', 'missing', 'video list failed', 'video detail failed');

    await withMockedFindRouteModule(
        videoMaterialFindModulePath,
        'videoMaterialFindHandler',
        pocketbaseMock,
        async (videoMaterialFindHandler) => {
            const app = createRouteApp('/v1/videoMaterial/find', 'get', videoMaterialFindHandler);
            app.post('/v1/videoMaterial/find', videoMaterialFindHandler);
            app.patch('/v1/videoMaterial/find', videoMaterialFindHandler);

            assert.equal((await requestJson(app, '/v1/videoMaterial/find?page=0')).code, 400);
            assert.equal((await requestJson(app, '/v1/videoMaterial/find?perPage=101')).code, 400);
            assert.equal((await requestJson(app, '/v1/videoMaterial/find?id=missing')).code, 404);
            assert.equal((await requestJson(app, '/v1/videoMaterial/find?id=broken')).code, 500);
            assert.equal((await requestJson(app, '/v1/videoMaterial/find?page=9')).code, 500);
            assert.equal((await requestJson(app, '/v1/videoMaterial/find?status=all&difficulty=bad', { method: 'PATCH' })).code, 10000);
        }
    );
});

function createFindCollectionMock(collectionName, missingId, listErrorMessage, detailErrorMessage) {
    return createCollectionMock({
        [collectionName]: {
            async getList(page, limit) {
                if (String(page) === '9') {
                    throw new Error(listErrorMessage);
                }
                return { items: [], totalItems: 0, totalPages: 0, page, perPage: limit };
            },
            async getOne(id) {
                if (id === missingId) {
                    const error = new Error('missing');
                    error.status = 404;
                    throw error;
                }
                throw new Error(detailErrorMessage);
            },
        },
    });
}

function createMaterialCollectionMock(collectionName, calls, record) {
    return createCollectionMock({
        [collectionName]: {
            async getList(page, limit, options) {
                calls.push({ page, limit, options });
                return { items: [{ collectionId: collectionName, title: '材料', ...record }], totalItems: 1, totalPages: 1, page, perPage: limit };
            },
            async getOne(id) {
                assert.equal(id, record.id);
                return { collectionId: collectionName, ...record };
            },
        },
    });
}
