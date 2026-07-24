import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.cwd());
const activeCourseDirectories = [
    'src/pages/courses',
    'src/pages/courseDetail',
    'src/pages/courseLessons',
    'src/pages/courseLessonDetail',
    'src/pages/courseRecords',
];
const activeCourseComponents = [
    'src/components/CourseSummaryCard.vue',
    'src/components/LessonRow.vue',
    'src/components/ValidityNotice.vue',
    'src/components/LessonRecordRow.vue',
];
const forbiddenTerms = [
    '课程点', '批次', '冻结', '兑换', '预约', '充值',
    '/v1/course-credits', 'credit_batches', 'conversion-authorizations',
];
const legacyPages = [
    'pages/courseCredits/index',
    'pages/courseCreditBatches/index',
    'pages/courseCreditBatch/index',
    'pages/courseCreditHistory/index',
    'pages/courseCreditConversion/index',
    'pages/courseCreditSessions/index',
];

const appConfig = await readFile(join(root, 'src/app.config.js'), 'utf8');
const apiSource = await readFile(join(root, 'utils/apis.js'), 'utf8');
const sourceFiles = [
    ...(await Promise.all(activeCourseDirectories.map((directory) => collect(join(root, directory))))).flat(),
    ...activeCourseComponents.map((file) => join(root, file)),
    join(root, 'utils/apis.js'),
];

for (const page of legacyPages) {
    assert(!appConfig.includes(`'${page}'`), `legacy student page is still published: ${page}`);
}
assert(appConfig.includes("pagePath: 'pages/courses/index'"), 'course tab is not registered');
assert(!apiSource.includes('/v1/course-credits'), 'legacy student course API remains callable');
assert(!/const\s+(convert|reserve|authorize|enroll)[A-Za-z]*\s*=/i.test(apiSource), 'student mutation wrapper remains exported');

for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    for (const term of forbiddenTerms) {
        assert(!source.includes(term), `forbidden student course term "${term}" in ${file}`);
    }
    if (file.includes('/src/pages/') || file.includes('/src/components/')) {
        assert(!/Api\.[A-Za-z]*(create|update|convert|reserve|enroll|purchase)/i.test(source),
            `student course mutation call in ${file}`);
    }
}

const learningPaths = [...apiSource.matchAll(/['`](\/v1\/student\/learning[^'`]*)['`]/g)]
    .map((match) => match[1].replace(/\$\{[^}]+\}/g, ':id'));
assert(learningPaths.length === 5, `expected five student learning wrappers, found ${learningPaths.length}`);

console.log(`Student course boundary passed: ${sourceFiles.length} files, ${learningPaths.length} read-only endpoints.`);

async function collect(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collect(path);
        return ['.js', '.vue', '.scss'].includes(extname(entry.name)) ? [path] : [];
    }));
    return nested.flat();
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
