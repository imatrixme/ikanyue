const test = require('node:test');
const assert = require('node:assert/strict');

const {
    EnrollmentRosterSyncService,
    emptyPreview,
    projectLesson,
    relation,
} = require('../src/services/courseCredits/enrollmentRosterSyncService');

const NOW = Date.parse('2026-07-23T08:00:00Z');

test('roster sync preview lists only future published lessons missing the enrolled student', async () => {
    const repository = mockRepository({
        links: [link('lesson-1'), link('lesson-2')],
        existingRoster: new Set(['lesson-2']),
    });
    const result = await service(repository).preview({ orderId: 'order-1' });

    assert.equal(result.classId, 'class-1');
    assert.deepEqual(result.lessons.map((lesson) => lesson.lessonId), ['lesson-1']);
    assert.match(result.previewHash, /^[a-f0-9]{64}$/);
    assert.match(repository.calls[0].options.filter, /startAt>=/);
});

test('roster sync confirmation atomically appends selected roster rows and increments snapshots', async () => {
    const repository = mockRepository({ links: [link('lesson-1'), link('lesson-2')] });
    const sync = service(repository);
    const preview = await sync.preview({ orderId: 'order-1' });
    const result = await sync.confirm(command({ previewHash: preview.previewHash, lessonIds: ['lesson-2'] }));

    assert.equal(result.status, 'completed');
    assert.deepEqual(result.synchronizedLessonIds, ['lesson-2']);
    assert.equal(result.replayed, false);
    assert.equal(created(repository.plan, 'session_students').sessionId, 'lesson-2');
    assert.equal(created(repository.plan, 'session_students').creditStatus, 'pending');
    assert.equal(updated(repository.plan, 'sessions').data.rosterVersion, 3);
    assert.ok(repository.plan.some((item) => item.collection === 'credit_version_claims'));
    assert.equal(created(repository.plan, 'outbox_events').topic, 'course-enrollment.roster-corrected');
});

test('roster sync handles no-class orders, all-lesson confirmation, replays, and stale previews', async () => {
    const noClassRepository = mockRepository({ order: order({ productSnapshot: {} }) });
    const noClass = await service(noClassRepository).preview({ orderId: 'order-1' });
    assert.equal(noClass.classId, null);
    assert.deepEqual(noClass.lessons, []);

    const repository = mockRepository({ links: [link('lesson-1')] });
    const sync = service(repository);
    const preview = await sync.preview({ orderId: 'order-1' });
    const all = await sync.confirm(command({ previewHash: preview.previewHash }));
    assert.deepEqual(all.synchronizedLessonIds, ['lesson-1']);

    const replayRepository = mockRepository({
        links: [link('lesson-1')],
        existingOperation: replayOperation(preview.previewHash),
    });
    const replay = await service(replayRepository).confirm(command({ previewHash: preview.previewHash }));
    assert.equal(replay.replayed, true);

    await assert.rejects(service(mockRepository({ links: [link('lesson-1')] })).confirm(command({ previewHash: 'stale' })),
        hasCode('SYNC_PREVIEW_STALE'));
    await assert.rejects(sync.confirm(command({ previewHash: preview.previewHash, lessonIds: ['missing'] })),
        hasCode('SYNC_LESSON_SELECTION_INVALID'));
});

test('roster sync validates required ids and helper fallbacks', async () => {
    const sync = service(mockRepository());
    await assert.rejects(sync.preview({}), hasCode('ORDER_ID_REQUIRED'));
    await assert.rejects(sync.confirm({ orderId: 'order-1' }), hasCode('SYNC_PREVIEW_HASH_REQUIRED'));

    const empty = emptyPreview(order({ productSnapshot: {} }));
    assert.match(empty.previewHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(projectLesson({}, 'fallback'), {
        lessonId: 'fallback', title: '', startAt: null, status: 'scheduled',
    });
    assert.deepEqual(relation({ expand: { x: [{ id: 'one' }] } }, 'x'), { id: 'one' });
    assert.deepEqual(relation({ expand: { x: [] } }, 'x'), {});
    assert.deepEqual(relation({}, 'x'), {});

    const fallbackRepository = mockRepository({ links: [{ sessionId: 'fallback', expand: { sessionId: {} } }] });
    assert.equal((await service(fallbackRepository).preview({ orderId: 'order-1' })).lessons[0].lessonId, 'fallback');
});

test('roster sync defaults and actor fallback are stable', async () => {
    const repository = mockRepository({ links: [link('lesson-1')] });
    const defaults = new EnrollmentRosterSyncService(repository);
    assert.equal(typeof defaults.clock, 'function');
    assert.equal(typeof defaults.idFactory, 'function');

    const sync = service(repository);
    const preview = await sync.preview({ orderId: 'order-1' });
    await sync.confirm(command({ previewHash: preview.previewHash, lessonIds: undefined, actorRole: '' }));
    assert.equal(created(repository.plan, 'ops_audit_logs').actorRole, 'admin');
});

function mockRepository(options = {}) {
    return {
        calls: [],
        plan: [],
        async get(collection, id) {
            if (collection === 'orders') return options.order || order();
            if (collection === 'sessions') return session(id);
            return null;
        },
        async list(collection, requestOptions) {
            this.calls.push({ collection, options: requestOptions });
            return collection === 'session_classes' ? options.links || [] : [];
        },
        async findFirst(collection, filter) {
            if (collection === 'credit_operations') return options.existingOperation || null;
            if (collection === 'session_students') {
                const lessonId = [...(options.existingRoster || [])].find((id) => filter.includes(`sessionId="${id}"`));
                return lessonId ? { id: `roster-${lessonId}` } : null;
            }
            return null;
        },
        async send(plan) {
            this.plan = plan;
            return plan;
        },
    };
}

function service(repository) {
    let index = 0;
    return new EnrollmentRosterSyncService(repository, {
        clock: () => NOW,
        idFactory: () => `id-${++index}`,
    });
}

function order(overrides = {}) {
    return { id: 'order-1', studentId: 'student-1', productSnapshot: { classId: 'class-1' }, ...overrides };
}

function session(id) {
    return { id, title: id, status: 'scheduled', startAt: '2026-08-01T10:00:00Z', rosterVersion: 2, version: 3 };
}

function link(id) {
    return { sessionId: id, expand: { sessionId: session(id) } };
}

function command(overrides = {}) {
    return {
        orderId: 'order-1', previewHash: '', lessonIds: [], idempotencyKey: 'sync-key',
        actorId: 'admin', actorRole: 'admin', traceId: 'trace', ...overrides,
    };
}

function replayOperation(previewHash) {
    const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
    return {
        requestSnapshot: { requestHash: fingerprintRequest({
            orderId: 'order-1', lessonIds: ['lesson-1'], previewHash,
        }) },
        resultSnapshot: { operationId: 'stored', synchronizedLessonIds: ['lesson-1'] },
    };
}

function created(plan, collection) {
    return plan.find((item) => item.action === 'create' && item.collection === collection)?.data;
}

function updated(plan, collection) {
    return plan.find((item) => item.action === 'update' && item.collection === collection);
}

function hasCode(code) {
    return (error) => error?.code === code;
}
