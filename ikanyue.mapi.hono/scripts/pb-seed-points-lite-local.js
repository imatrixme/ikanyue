#!/usr/bin/env node

const dotenv = require('dotenv');
const md5 = require('licia/md5');

dotenv.config({ path: process.env.KANYUE_ENV_FILE || '.env' });

const LOCAL_STUDENTS = [
    {
        id: 'localstudent001',
        cellphone: '13800000001',
        nickName: '本地学员一',
        realName: '本地学员一',
        balance: 120,
    },
    {
        id: 'localstudent002',
        cellphone: '13800000002',
        nickName: '本地学员二',
        realName: '本地学员二',
        balance: 40,
    },
];

const LOCAL_REWARDS = [
    { id: 'localreward0001', name: '贴纸', description: '本地测试实物', pointsPrice: 50, sortOrder: 10, status: 'active' },
    { id: 'localreward0002', name: '练习册', description: '本地测试实物', pointsPrice: 200, sortOrder: 20, status: 'active' },
    { id: 'localreward0003', name: '下线徽章', description: '本地测试下线实物', pointsPrice: 10, sortOrder: 30, status: 'inactive' },
];

const LOCAL_MANAGED_TEST_CELLPHONES = ['13900009991', '13900009992'];

function createLocalActivities(baseDate = new Date()) {
    const startTime = new Date(baseDate);
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(10, 0, 0, 0);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);

    return [
        {
            id: 'localactivity01',
            title: '声乐体验与声音评估',
            description: '<p>面向希望了解科学发声与声乐训练方式的学习者，本次活动将通过基础声音评估、呼吸与共鸣练习，帮助参与者认识当前声音状态，并获得适合自身阶段的训练建议。</p><p>活动适合儿童、青少年及成人初学者参加，无需声乐基础。老师会结合年龄、声音条件与学习目标进行现场指导，具体训练内容以实际评估为准。</p>',
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            location: '看乐艺术教室',
            price: 0,
            externalLink: '',
            tags: '声乐,体验',
            sequence: 10,
            maxParticipants: 20,
            currentParticipants: 0,
            status: 'active',
            type: 'experience',
            creator: 'local-seed',
        },
    ];
}

async function main() {
    const url = process.env.PB_URL || 'http://127.0.0.1:8090';
    assertLocalPocketBase(url);
    if (!envFlag('KANYUE_LOCAL_SEED')) {
        throw new Error('KANYUE_LOCAL_SEED=true is required to reset local points-lite fixtures');
    }

    const password = requiredEnv('LOCAL_STUDENT_PASSWORD');
    const PocketBase = await import('pocketbase');
    const pb = new PocketBase.default(url);
    await pb.collection('_superusers').authWithPassword(requiredEnv('PB_EMAIL'), requiredEnv('PB_PASSWORD'));

    await cleanupManagedStudentFixtures(pb);

    for (const student of LOCAL_STUDENTS) {
        await upsertById(pb.collection('students'), student.id, {
            id: student.id,
            sn: student.id,
            cellphone: student.cellphone,
            password: md5(password),
            tokenKey: `token-${student.id}`,
            nickName: student.nickName,
            realName: student.realName,
            blocked: false,
            gender: 0,
        });
    }

    for (const reward of LOCAL_REWARDS) {
        await upsertById(pb.collection('reward_items'), reward.id, reward);
    }

    const activities = createLocalActivities();
    for (const activity of activities) {
        await upsertById(pb.collection('activities'), activity.id, activity);
    }

    await resetLocalPointEvents(pb);
    for (const student of LOCAL_STUDENTS) {
        await upsertByFilter(pb.collection('student_points'), `studentId="${student.id}"`, {
            studentId: student.id,
            balance: student.balance,
        });
        await pb.collection('point_events').create({
            studentId: student.id,
            type: 'earn',
            delta: student.balance,
            balanceAfter: student.balance,
            operatorId: 'local-seed',
            operatorRole: 'admin',
            reason: 'local_seed',
            remark: '本地测试基线',
            rewardItemId: '',
            rewardSnapshot: null,
        });
    }

    console.log(
        `seeded ${LOCAL_STUDENTS.length} local students, ${LOCAL_REWARDS.length} local rewards, and ${activities.length} local activity`
    );
}

async function cleanupManagedStudentFixtures(pb) {
    for (const cellphone of LOCAL_MANAGED_TEST_CELLPHONES) {
        const students = await pb.collection('students').getFullList({ filter: `cellphone="${cellphone}"` });
        for (const student of students) {
            await deleteByFilter(pb.collection('point_events'), `studentId="${student.id}"`);
            await deleteByFilter(pb.collection('student_points'), `studentId="${student.id}"`);
            await pb.collection('students').delete(student.id);
        }
    }
}

async function deleteByFilter(collection, filter) {
    const records = await collection.getFullList({ filter });
    for (const record of records) {
        await collection.delete(record.id);
    }
}

async function resetLocalPointEvents(pb) {
    for (const student of LOCAL_STUDENTS) {
        const events = await pb.collection('point_events').getFullList({
            filter: `studentId="${student.id}"`,
        });
        for (const event of events) {
            await pb.collection('point_events').delete(event.id);
        }
    }
}

async function upsertById(collection, id, payload) {
    try {
        await collection.getOne(id);
        return collection.update(id, withoutId(payload));
    } catch (error) {
        if (error?.status !== 404) {
            throw error;
        }
        return collection.create(payload);
    }
}

async function upsertByFilter(collection, filter, payload) {
    const result = await collection.getList(1, 1, { filter });
    if (result.items?.[0]) {
        return collection.update(result.items[0].id, payload);
    }
    return collection.create(payload);
}

function withoutId(payload) {
    const result = { ...payload };
    delete result.id;
    return result;
}

function assertLocalPocketBase(value) {
    const url = new URL(value);
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        throw new Error(`Refusing to seed non-local PocketBase host: ${url.hostname}`);
    }
}

function envFlag(name) {
    return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required for local points-lite seed`);
    }
    return value;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    LOCAL_MANAGED_TEST_CELLPHONES,
    LOCAL_REWARDS,
    LOCAL_STUDENTS,
    assertLocalPocketBase,
    createLocalActivities,
    main,
};
