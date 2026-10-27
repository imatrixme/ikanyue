const TEACHER_OPS_FIELDS = [
    boolField('opsPasswordChangeRequired'),
    dateField('lastPasswordChangedAt'),
];

const LOCAL_CORE_COLLECTIONS = [
    {
        name: 'students',
        type: 'base',
        fields: [
            textField('sn'),
            textField('cellphone'),
            textField('password'),
            textField('tokenKey'),
            textField('nickName'),
            textField('realName'),
            textField('avatar'),
            boolField('blocked'),
            numberField('gender'),
            numberField('age'),
            textField('province'),
            dateField('lastLoginAt'),
            textField('lastLoginIp'),
            textField('lastLoginMethod'),
            textField('wechatId'),
            textField('wechatUnionId'),
            jsonField('wechatUserInfo'),
            autoDateField('created', false),
            autoDateField('updated', true),
        ],
        indexes: [
            'CREATE UNIQUE INDEX idx_students_sn ON students (sn)',
            'CREATE UNIQUE INDEX idx_students_cellphone ON students (cellphone)',
        ],
    },
    {
        name: 'teachers',
        type: 'auth',
        fields: [
            textField('sn'),
            textField('username'),
            textField('cellphone'),
            textField('nickName'),
            textField('realName'),
            textField('avatar'),
            boolField('blocked'),
            numberField('gender'),
            numberField('age'),
            textField('province'),
            boolField('idAdmin'),
            boolField('isAdmin'),
            ...TEACHER_OPS_FIELDS,
            dateField('lastLoginAt'),
            textField('lastLoginIp'),
            textField('lastLoginMethod'),
            autoDateField('created', false),
            autoDateField('updated', true),
        ],
        indexes: [
            'CREATE UNIQUE INDEX idx_teachers_sn ON teachers (sn)',
            'CREATE UNIQUE INDEX idx_teachers_username ON teachers (username)',
            'CREATE UNIQUE INDEX idx_teachers_cellphone ON teachers (cellphone)',
        ],
    },
    {
        name: 'activities',
        type: 'base',
        fields: [
            textField('title'),
            textField('description'),
            dateField('startTime'),
            dateField('endTime'),
            textField('location'),
            numberField('price'),
            fileField('coverImage'),
            fileField('images', 10),
            textField('externalLink'),
            textField('tags'),
            numberField('sequence'),
            numberField('maxParticipants'),
            numberField('currentParticipants'),
            textField('status'),
            textField('type'),
            textField('creator'),
            autoDateField('created', false),
            autoDateField('updated', true),
        ],
        indexes: [
            'CREATE INDEX idx_activities_status_start ON activities (status, startTime)',
        ],
    },
];

async function listCollections(pb) {
    const collections = await pb.collections.getFullList({ perPage: 500 });
    return new Map(collections.map((item) => [item.name, item]));
}

async function ensureLocalCoreCollections(pb, enabled) {
    let byName = await listCollections(pb);
    if (!enabled) {
        return byName;
    }

    const scaffolds = await pb.collections.getScaffolds();
    for (const definition of LOCAL_CORE_COLLECTIONS) {
        const current = byName.get(definition.name);
        if (current) {
            const fields = Array.isArray(current.fields) ? current.fields : [];
            const missing = definition.fields.filter((field) => !hasFieldNamed(fields, field.name));
            if (missing.length) {
                await pb.collections.update(current.id, { fields: [...fields, ...missing] });
                console.log(`updated local core collection ${definition.name}`);
            }
            continue;
        }
        const scaffold = scaffolds[definition.type];
        if (!scaffold) {
            throw new Error(`PocketBase did not return a ${definition.type} collection scaffold`);
        }
        const payload = collectionPayload(scaffold, definition);
        const created = await pb.collections.create(payload);
        byName.set(definition.name, created);
        console.log(`created local core collection ${definition.name}`);
    }
    return listCollections(pb);
}

async function applyOpsSchemas(pb, schemas, initialCollections) {
    let byName = initialCollections || await listCollections(pb);
    const deferredSchemas = [];
    for (const schema of schemas) {
        const current = byName.get(schema.name);
        const readyFields = schema.fields.filter((field) => isResolvableField(field, byName));
        const deferredFields = schema.fields.filter((field) => !isResolvableField(field, byName));
        if (deferredFields.length) {
            deferredSchemas.push(schema);
        }
        const payload = {
            ...schema,
            fields: readyFields.map((field) => normalizeFieldPayload(field, byName)),
            indexes: indexesWithoutDeferredFields(schema.indexes, deferredFields),
        };
        if (current) {
            await pb.collections.update(current.id, payload);
            console.log(`updated ${schema.name}`);
        } else {
            const created = await pb.collections.create(payload);
            console.log(`created ${schema.name}`);
            byName.set(schema.name, created);
        }
        byName = await listCollections(pb);
    }

    for (const schema of deferredSchemas) {
        const current = byName.get(schema.name);
        if (!current?.id) {
            throw new Error(`Missing deferred collection "${schema.name}"`);
        }
        await pb.collections.update(current.id, {
            ...schema,
            fields: schema.fields.map((field) => normalizeFieldPayload(field, byName)),
            indexes: [...schema.indexes],
        });
        console.log(`completed deferred relations for ${schema.name}`);
        byName = await listCollections(pb);
    }
    return byName;
}

async function ensureTeacherOpsFields(pb, byName) {
    const teachers = byName.get('teachers');
    if (!teachers?.id) {
        throw new Error('Missing teachers collection; enable local core bootstrap for an empty local database');
    }
    const fields = Array.isArray(teachers.fields) ? [...teachers.fields] : [];
    const missing = TEACHER_OPS_FIELDS.filter((field) => !hasFieldNamed(fields, field.name));
    if (!missing.length) {
        return;
    }
    await pb.collections.update(teachers.id, { fields: [...fields, ...missing] });
    console.log('updated teachers ops fields');
}

async function ensureBootstrapAdmin(pb, options = {}) {
    if (!options.enabled) {
        return null;
    }
    const username = required(options.username, 'OPS_BOOTSTRAP_ADMIN_USERNAME');
    const email = required(options.email, 'OPS_BOOTSTRAP_ADMIN_EMAIL');
    const password = required(options.password, 'OPS_BOOTSTRAP_ADMIN_PASSWORD');
    const cellphone = required(options.cellphone, 'OPS_BOOTSTRAP_ADMIN_CELLPHONE');
    if (password.length < 12) {
        throw new Error('OPS_BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters');
    }

    const list = await pb.collection('teachers').getList(1, 1, {
        filter: `username="${escapeFilter(username)}" || email="${escapeFilter(email)}"`,
    });
    if (list.items?.[0]) {
        console.log(`bootstrap admin ${username} already exists; credentials were not changed`);
        return list.items[0];
    }

    const id = options.id || 'opslocaladmin01';
    const created = await pb.collection('teachers').create({
        id,
        sn: id,
        username,
        email,
        emailVisibility: false,
        cellphone,
        password,
        passwordConfirm: password,
        nickName: options.displayName || '本地管理员',
        realName: options.displayName || '本地管理员',
        blocked: false,
        verified: true,
        idAdmin: true,
        isAdmin: true,
        opsPasswordChangeRequired: Boolean(options.passwordChangeRequired),
    });
    console.log(`created bootstrap admin ${username}`);
    return created;
}

function collectionPayload(scaffold, definition) {
    const payload = JSON.parse(JSON.stringify(scaffold));
    for (const key of ['id', 'created', 'updated', 'system']) {
        delete payload[key];
    }
    payload.name = definition.name;
    payload.type = definition.type;
    payload.fields = [...(payload.fields || []), ...definition.fields];
    payload.indexes = [...(definition.indexes || [])];
    payload.listRule = null;
    payload.viewRule = null;
    payload.createRule = null;
    payload.updateRule = null;
    payload.deleteRule = null;
    if (definition.type === 'auth') {
        payload.passwordAuth = {
            ...(payload.passwordAuth || {}),
            enabled: true,
            identityFields: ['email'],
        };
    }
    return payload;
}

function normalizeFieldPayload(field, byName) {
    const payload = { ...field };
    if (payload.type === 'relation' && payload.collectionName && !payload.collectionId) {
        const collection = byName.get(payload.collectionName);
        if (!collection?.id) {
            throw new Error(`Missing related collection "${payload.collectionName}" for field "${payload.name}"`);
        }
        payload.collectionId = collection.id;
        delete payload.collectionName;
    }
    return payload;
}

function isResolvableField(field, byName) {
    return field.type !== 'relation' || !field.collectionName || byName.has(field.collectionName);
}

function hasFieldNamed(fields, name) {
    const normalized = name.toLowerCase();
    return fields.some((field) => String(field.name || '').toLowerCase() === normalized);
}

function indexesWithoutDeferredFields(indexes, deferredFields) {
    const deferredNames = deferredFields.map((field) => field.name);
    return indexes.filter((index) => !deferredNames.some((name) => (
        new RegExp(`\\b${escapeRegExp(name)}\\b`).test(index)
    )));
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textField(name) {
    return { name, type: 'text', required: false, max: 0 };
}

function numberField(name) {
    return { name, type: 'number', required: false, min: null, max: null };
}

function boolField(name) {
    return { name, type: 'bool', required: false };
}

function dateField(name) {
    return { name, type: 'date', required: false };
}

function jsonField(name) {
    return { name, type: 'json', required: false };
}

function fileField(name, maxSelect = 1) {
    return {
        name,
        type: 'file',
        required: false,
        maxSelect,
        maxSize: 5 * 1024 * 1024,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
        protected: false,
        thumbs: [],
    };
}

function autoDateField(name, onUpdate) {
    return { name, type: 'autodate', onCreate: true, onUpdate };
}

function required(value, name) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${name} is required when admin bootstrap is enabled`);
    }
    return value.trim();
}

function escapeFilter(value) {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

// Seed the studio itself once, so the mini program never starts with an empty venue list.
// Existing venues (including deactivated ones) are left untouched.
async function ensureDefaultVenue(pb) {
    const list = await pb.collection('venues').getList(1, 1);
    if (list.items?.[0]) {
        return list.items[0];
    }
    const created = await pb.collection('venues').create(DEFAULT_VENUE);
    console.log('created default venue');
    return created;
}

const DEFAULT_VENUE = {
    address: '',
    bookable: true,
    intro: '声乐课程与预约',
    name: '看乐艺术',
    openingHours: '',
    phone: '18521301857',
    sortOrder: 0,
    status: 'active',
};

module.exports = {
    DEFAULT_VENUE,
    LOCAL_CORE_COLLECTIONS,
    applyOpsSchemas,
    ensureBootstrapAdmin,
    ensureDefaultVenue,
    ensureLocalCoreCollections,
    ensureTeacherOpsFields,
    listCollections,
};
