const { Hono } = require('hono');
const md5 = require('licia/md5');

const { responseMiddleware } = require('../../src/middleware/response');
const opsRoutes = require('../../src/routes/ops');
const { createOpsHandlers } = require('../../src/routes/ops/handlers');
const pointsRoutes = require('../../src/routes/points');
const { createPointHandlers } = require('../../src/routes/points/handlers');
const { createOpsServices } = require('../../src/services/ops');
const { jwtAuth } = require('../../src/utils/jwtAuth');
const { createRouteBuilder } = require('../../src/utils/routeBuilder');

function createOpsApp(repository) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    const services = createOpsServices(repository);
    opsRoutes(routes, createOpsHandlers(services));
    pointsRoutes(routes, createPointHandlers(services));
    routes.finalize();
    return app;
}

function createOpsTestRepository(seed = {}) {
    return new InMemoryOpsRepository(seed);
}

class InMemoryOpsRepository {
    constructor(seed = {}) {
        this.client = {
            ensureAuth: async () => true,
            files: {
                getURL: (record, filename) => `https://pb.test/api/files/${record.collectionId || record.collection || 'collection'}/${record.id}/${filename}`,
            },
        };
        this.data = {};
        Object.entries(seed).forEach(([name, records]) => {
            this.data[name] = records.map((record) => ({ ...record }));
        });
        this.counters = {};
    }

    async list(name, page = 1, perPage = 20, options = {}) {
        const all = sortRecords(this.ensure(name).filter((record) => matchFilter(record, options.filter || '')), options.sort);
        const start = (Number(page) - 1) * Number(perPage);
        return {
            items: all.slice(start, start + Number(perPage)).map(clone),
            page: Number(page),
            perPage: Number(perPage),
            totalItems: all.length,
            totalPages: Math.ceil(all.length / Number(perPage)),
        };
    }

    async get(name, id) {
        const record = this.ensure(name).find((item) => item.id === id);
        if (!record) {
            const error = new Error(`${name} missing`);
            error.status = 404;
            throw error;
        }
        return clone(record);
    }

    async create(name, data) {
        const record = {
            id: data.id || `${name}_${(this.counters[name] = (this.counters[name] || 0) + 1)}`,
            collection: name,
            collectionId: name,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            ...cloneRecordData(data),
        };
        this.ensure(name).push(record);
        return clone(record);
    }

    async update(name, id, data) {
        const records = this.ensure(name);
        const index = records.findIndex((item) => item.id === id);
        if (index < 0) {
            const error = new Error(`${name} missing`);
            error.status = 404;
            throw error;
        }
        records[index] = { ...records[index], ...cloneRecordData(data), updated: new Date().toISOString() };
        return clone(records[index]);
    }

    async delete(name, id) {
        const records = this.ensure(name);
        const index = records.findIndex((item) => item.id === id);
        if (index >= 0) {
            records.splice(index, 1);
        }
        return true;
    }

    ensure(name) {
        if (!this.data[name]) {
            this.data[name] = [];
        }
        return this.data[name];
    }
}

function createOpsSeed() {
    const templateSchema = createTemplateSchema();
    return {
        teachers: [
            teacher('teacher_1', { cellphone: '13800138001', isAdmin: false }),
            teacher('admin_1', { username: 'admin', cellphone: '13800138002', password: md5('1loveU_shaoyi'), isAdmin: true }),
            teacher('blocked_1', { cellphone: '13800138003', blocked: true }),
            teacher('pending_1', { cellphone: '13800138004', verified: false }),
        ],
        students: [
            { id: 'student_1', blocked: false, cellphone: '13900139001', nickName: '小张', realName: '张同学', wechatId: 'openid_secret' },
            { id: 'student_2', blocked: false, cellphone: '13900139002', nickName: '小李', realName: '李同学' },
        ],
        teacher_student_relations: [
            { id: 'rel_1', teacherId: 'teacher_1', studentId: 'student_1', status: 'active' },
        ],
        activities: [
            { id: 'activity_1', title: '公开课', status: 'active', location: '上海', maxParticipants: 20 },
        ],
        audio_materials: [
            { id: 'audio_1', title: '气息练习', author: '王老师', status: 'published' },
        ],
        video_materials: [
            { id: 'video_1', title: '音阶练习', author: '王老师', status: 'published' },
        ],
        operation_slots: [
            {
                id: 'slot_1',
                channel: 'wechat-mini',
                placement: 'home-banner',
                title: '首页焦点',
                description: '展示测评入口',
                status: 'active',
                sortOrder: 10,
                targetType: 'assessment_report',
                targetId: 'report_1',
                targetUrl: '/pages/assessmentReport/index?token=demo',
                imageUrl: 'https://example.com/banner.png',
            },
            { id: 'slot_2', channel: 'wechat-mini', placement: 'home-banner', title: '已下线', status: 'disabled', sortOrder: 1 },
            { id: 'slot_3', channel: 'app', placement: 'home-banner', title: 'App 专属', status: 'active', sortOrder: 1 },
            {
                id: 'slot_4',
                channel: 'wechat-mini',
                placement: 'home-banner',
                title: '未来可见',
                status: 'active',
                visibleFrom: '2099-01-01T00:00:00.000Z',
                sortOrder: 2,
            },
        ],
        assessment_templates: [
            {
                id: 'template_1',
                name: '声乐阶段测评',
                version: 1,
                status: 'published',
                schemaJson: templateSchema,
                scoringJson: templateSchema.scoring,
                reportJson: { title: '声乐阶段报告' },
                createdBy: 'admin_1',
            },
        ],
        assessment_records: [],
        assessment_report_snapshots: [
            {
                id: 'report_1',
                assessmentRecordId: 'assessment_seed_1',
                studentId: 'student_1',
                teacherId: 'teacher_1',
                templateId: 'template_1',
                totalScore: 91,
                grade: 'A',
                reportJson: {
                    id: 'report_1',
                    title: '声乐阶段报告',
                    student: { realName: '张同学', cellphone: 'secret-phone', wechatId: 'secret-openid' },
                    teacher: { realName: 'teacher_1', token: 'secret-token' },
                    score: {
                        totalScore: 91,
                        grade: 'A',
                        sections: [{ key: 'pitch', title: '音准', score: 55, maxScore: 60, comment: '稳定', recommendations: ['慢练音阶'] }],
                    },
                    summary: '音准稳定',
                    recommendations: ['保持气息'],
                    generatedAt: '2026-05-20T08:00:00.000Z',
                },
                created: '2026-05-20T08:00:00.000Z',
            },
            {
                id: 'report_2',
                assessmentRecordId: 'assessment_seed_2',
                studentId: 'student_2',
                teacherId: 'admin_1',
                templateId: 'template_1',
                totalScore: 76,
                grade: 'C',
                reportJson: { title: '其他学员报告', score: { totalScore: 76, grade: 'C' } },
                created: '2026-05-21T08:00:00.000Z',
            },
        ],
        assessment_share_links: [],
        activity_signups: [
            {
                id: 'signup_1',
                userId: 'student_1',
                activityId: 'activity_1',
                realName: '张同学',
                age: 12,
                status: 'registered',
                created: '2026-05-19T08:00:00.000Z',
            },
            {
                id: 'signup_2',
                userId: 'student_2',
                activityId: 'activity_1',
                realName: '李同学',
                age: 13,
                status: 'registered',
                created: '2026-05-19T09:00:00.000Z',
            },
        ],
        reward_items: [],
        student_points: [],
        point_events: [],
        ops_audit_logs: [],
    };
}

function teacher(id, overrides = {}) {
    return {
        id,
        sn: `${id}_sn`,
        cellphone: id,
        password: md5('secret'),
        nickName: id,
        realName: id,
        blocked: false,
        verified: true,
        isAdmin: false,
        ...overrides,
    };
}

function createTemplateSchema(overrides = {}) {
    return {
        sections: [
            {
                key: 'pitch',
                title: '音准',
                weight: 0.6,
                items: [
                    {
                        key: 'pitch_stability',
                        label: '音准稳定性',
                        type: 'single_choice',
                        required: true,
                        options: [
                            { value: 'good', label: '良好', score: 90 },
                            { value: 'average', label: '一般', score: 70 },
                        ],
                    },
                    { key: 'pitch_comment', label: '音准评语', type: 'textarea' },
                ],
            },
            {
                key: 'rhythm',
                title: '节奏',
                weight: 0.4,
                items: [{ key: 'rhythm_score', label: '节奏分', type: 'number_score' }],
            },
        ],
        scoring: {
            type: 'weighted_sum',
            maxScore: 100,
            gradeBands: [
                { min: 90, label: 'A' },
                { min: 80, label: 'B' },
                { min: 60, label: 'C' },
            ],
        },
        ...overrides,
    };
}

function createToken(user) {
    return jwtAuth.sign({ headers: {} }, user.id, user.sn, 'teacher', Boolean(user.isAdmin));
}

function createStudentToken(user) {
    return jwtAuth.sign({ headers: {} }, user.id, user.sn || user.id, 'student', false);
}

async function jsonRequest(app, path, { method = 'GET', token = '', body } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) {
        headers.authorization = `Bearer ${token}`;
    }
    const response = await app.request(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json();
}

function matchFilter(record, filter) {
    if (!filter) {
        return true;
    }
    const parts = stripOuter(filter).split(/\s+&&\s+/);
    return parts.every((part) => matchExpression(record, part.trim()));
}

function matchExpression(record, expression) {
    const expr = stripOuter(expression);
    if (expr.includes(' || ')) {
        return expr.split(/\s+\|\|\s+/).some((part) => matchExpression(record, part));
    }
    const equals = expr.match(/^(\w+)\s*=\s*"([^"]*)"$/);
    if (equals) {
        return String(record[equals[1]] ?? '') === equals[2];
    }
    const booleanEquals = expr.match(/^(\w+)\s*=\s*(true|false)$/);
    if (booleanEquals) {
        return Boolean(record[booleanEquals[1]]) === (booleanEquals[2] === 'true');
    }
    const contains = expr.match(/^(\w+)\s*~\s*"([^"]*)"$/);
    if (contains) {
        return String(record[contains[1]] ?? '').includes(contains[2]);
    }
    return true;
}

function sortRecords(records, sort = '') {
    const field = String(sort || '').trim();
    if (!field) {
        return records;
    }
    const descending = field.startsWith('-');
    const key = descending ? field.slice(1) : field;
    return [...records].sort((left, right) => {
        const leftValue = left[key] ?? '';
        const rightValue = right[key] ?? '';
        if (leftValue === rightValue) {
            return 0;
        }
        const result = leftValue > rightValue ? 1 : -1;
        return descending ? -result : result;
    });
}

function stripOuter(value) {
    const text = String(value || '').trim();
    if (text.startsWith('(') && text.endsWith(')')) {
        return text.slice(1, -1);
    }
    return text;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function cloneRecordData(value = {}) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (item && typeof item === 'object' && typeof item.name === 'string' && typeof item.arrayBuffer === 'function') {
            return [key, item.name];
        }
        return [key, clone(item)];
    }));
}

module.exports = {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createTemplateSchema,
    createStudentToken,
    createToken,
    jsonRequest,
};
