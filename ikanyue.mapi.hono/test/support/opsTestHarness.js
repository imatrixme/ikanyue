const { Hono } = require('hono');
const md5 = require('licia/md5');

const { responseMiddleware } = require('../../src/middleware/response');
const opsRoutes = require('../../src/routes/ops');
const { createOpsHandlers } = require('../../src/routes/ops/handlers');
const { createOpsServices } = require('../../src/services/ops');
const { jwtAuth } = require('../../src/utils/jwtAuth');
const { createRouteBuilder } = require('../../src/utils/routeBuilder');

function createOpsApp(repository) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    opsRoutes(routes, createOpsHandlers(createOpsServices(repository)));
    routes.finalize();
    return app;
}

function createOpsTestRepository(seed = {}) {
    return new InMemoryOpsRepository(seed);
}

class InMemoryOpsRepository {
    constructor(seed = {}) {
        this.data = {};
        Object.entries(seed).forEach(([name, records]) => {
            this.data[name] = records.map((record) => ({ ...record }));
        });
        this.counters = {};
    }

    async list(name, page = 1, perPage = 20, options = {}) {
        const all = this.ensure(name).filter((record) => matchFilter(record, options.filter || ''));
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
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            ...clone(data),
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
        records[index] = { ...records[index], ...clone(data), updated: new Date().toISOString() };
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
            teacher('admin_1', { cellphone: '13800138002', isAdmin: true }),
            teacher('blocked_1', { cellphone: '13800138003', blocked: true }),
            teacher('pending_1', { cellphone: '13800138004', verified: false }),
        ],
        students: [
            { id: 'student_1', cellphone: '13900139001', nickName: '小张', realName: '张同学', wechatId: 'openid_secret' },
            { id: 'student_2', cellphone: '13900139002', nickName: '小李', realName: '李同学' },
        ],
        teacher_student_relations: [
            { id: 'rel_1', teacherId: 'teacher_1', studentId: 'student_1', status: 'active' },
        ],
        activities: [
            { id: 'activity_1', title: '公开课', status: 'active', location: '上海' },
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
        assessment_report_snapshots: [],
        assessment_share_links: [],
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
    const contains = expr.match(/^(\w+)\s*~\s*"([^"]*)"$/);
    if (contains) {
        return String(record[contains[1]] ?? '').includes(contains[2]);
    }
    return true;
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

module.exports = {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createTemplateSchema,
    createToken,
    jsonRequest,
};
