import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../scripts/export-icons.mjs';

// Source-level product contracts, carried over from the Taro build's e2e checks on dist output.
const root = new URL('../miniprogram/', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

function collect(directory, extensions = ['.js', '.wxml', '.scss', '.json']) {
    return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collect(path, extensions);
        return extensions.includes(extname(entry.name)) ? [path] : [];
    });
}

const app = json('app.json');
const sources = collect('.', ['.js', '.wxml', '.scss']);
const generated = ['styles/_brand.generated.scss', 'styles/theme.js', 'styles/_tokens.scss'];

describe('app shell', () => {
    it('publishes the 31 pages and three tabs', () => {
        expect(app.pages).toEqual([
            'pages/home/index', 'pages/activity/index', 'pages/courses/index', 'pages/points/index', 'pages/profile/index',
            'pages/courseDetail/index', 'pages/courseShop/index', 'pages/courseOrder/index', 'pages/courseLessons/index',
            'pages/courseLessonDetail/index', 'pages/teacherLessonDetail/index', 'pages/courseRecords/index',
            'pages/appointmentBooking/index', 'pages/appointmentSlots/index', 'pages/appointments/index',
            'pages/appointmentDetail/index', 'pages/venues/index', 'pages/teacherAvailability/index',
            'pages/pointsHistory/index', 'pages/rewardCatalog/index', 'pages/userinfo/index', 'pages/activityDetail/index',
            'pages/imageDetail/index', 'pages/webview/index', 'pages/agreement/index', 'pages/memberCard/index',
            'pages/workbenchStudents/index', 'pages/workbenchStudent/index', 'pages/workbenchGrant/index',
            'pages/workbenchTeachers/index', 'pages/workbenchTeacher/index',
        ]);
        expect(app.tabBar.list.map((item) => [item.pagePath, item.text])).toEqual([
            ['pages/home/index', '首页'], ['pages/appointmentBooking/index', '约课'], ['pages/profile/index', '我的'],
        ]);
        for (const item of app.tabBar.list) {
            expect(readFileSync(join(root, item.iconPath)).length).toBeGreaterThan(0);
            expect(readFileSync(join(root, item.selectedIconPath)).length).toBeGreaterThan(0);
        }
    });

    it('keeps the canvas chrome, refresh and paging settings per page', () => {
        const canvas = ['activity', 'points', 'pointsHistory', 'rewardCatalog', 'userinfo', 'courses', 'courseDetail',
            'courseLessons', 'courseLessonDetail', 'teacherLessonDetail', 'courseRecords', 'memberCard'];
        for (const page of canvas) {
            expect(json(`pages/${page}/index.json`), page).toMatchObject({
                backgroundColorTop: '#f4f4f2', backgroundColorBottom: '#f4f4f2', backgroundTextStyle: 'dark',
            });
            expect(json(`pages/${page}/index.json`).navigationBarBackgroundColor, page).toBeUndefined();
        }
        expect(json('pages/profile/index.json')).toMatchObject({
            backgroundColorTop: '#d4e9e2', backgroundColorBottom: '#f4f4f2', backgroundTextStyle: 'dark', navigationBarBackgroundColor: '#d4e9e2', navigationBarTextStyle: 'black',
        });
        for (const page of [...canvas, 'activityDetail', 'profile']) {
            expect(json(`pages/${page}/index.json`).enablePullDownRefresh, page).toBe(true);
        }
        for (const page of ['pointsHistory', 'courseLessons', 'courseRecords']) {
            expect(json(`pages/${page}/index.json`).onReachBottomDistance, page).toBe(120);
        }
    });
});

describe('student course and booking boundary', () => {
    const courseFiles = [
        ...['home', 'courses', 'courseDetail', 'courseLessons', 'courseLessonDetail', 'courseRecords'].flatMap((page) => collect(`pages/${page}`)),
        ...['course-summary-card', 'lesson-row', 'validity-notice', 'lesson-record-row'].flatMap((name) => collect(`components/${name}`)),
    ];
    const bookingFiles = [
        ...['appointmentBooking', 'appointmentSlots', 'appointments', 'appointmentDetail', 'teacherAvailability'].flatMap((page) => collect(`pages/${page}`)),
        ...['appointment-row', 'booking-option-card', 'booking-status-badge', 'teacher-booking-home', 'teacher-calendar-home'].flatMap((name) => collect(`components/${name}`)),
    ];
    const scheduleFiles = [
        ...collect('pages/teacherLessonDetail'), 'core/schedule.js',
        ...['lesson-row', 'upcoming-lessons', 'teacher-calendar-home'].flatMap((name) => collect(`components/${name}`)),
    ];
    const apis = read('services/apis.js');

    it('never shows retired course-credit vocabulary or APIs', () => {
        const forbidden = ['课程点', '批次', '冻结', '兑换', '充值', '/v1/course-credits', 'credit_batches', 'conversion-authorizations'];
        for (const file of new Set([...courseFiles, ...bookingFiles, ...scheduleFiles, 'services/apis.js'])) {
            const source = read(file);
            expect(forbidden.filter((term) => source.includes(term)), file).toEqual([]);
        }
        expect(apis).not.toMatch(/const\s+(convert|reserve|authorize|enroll)[A-Za-z]*\s*=/i);
    });

    it('keeps course pages read-only and booking mutations to the approved set', () => {
        const allowed = new Set([
            'cancelStudentAppointment', 'cancelTeacherAppointment', 'cancelTeacherAvailabilityOverride',
            'confirmTeacherAppointment', 'confirmWorkbenchLesson', 'createStudentAppointment', 'createTeacherAvailabilityOverride',
            'declineTeacherAppointment', 'rescheduleTeacherAppointment', 'saveTeacherAvailability', 'withdrawStudentAppointment',
        ]);
        for (const file of courseFiles) expect(read(file), file).not.toMatch(/Api\.[A-Za-z]*(create|update|convert|reserve|enroll|purchase)/i);
        for (const file of bookingFiles) {
            const calls = [...read(file).matchAll(/Api\.([A-Za-z]*(?:create|update|save|confirm|decline|cancel|withdraw|reschedule)[A-Za-z]*)\s*\(/g)];
            expect(calls.map((match) => match[1]).filter((name) => !allowed.has(name)), file).toEqual([]);
        }
        const learningPaths = [...apis.matchAll(/['`](\/v1\/student\/learning[^'`]*)['`]/g)];
        expect(learningPaths).toHaveLength(5);
    });
});

describe('runtime hygiene', () => {
    it('scans every page, component and module', () => {
        // 25 pages and 27 components with js + wxml + scss, plus kit, core and services.
        expect(sources.length).toBeGreaterThan(180);
        expect(sources).toContain('styles/theme.js');
    });

    it('calls business APIs only, never gateway or payment credentials and test endpoints', () => {
        const forbidden = /PAY_SERVICE_TOKEN|PAY_MOCK_TOKEN|PAY_PB_PASSWORD|\/_test\/observations|\/api\/collections\/|studentId=/;
        for (const file of sources) expect(read(file), file).not.toMatch(forbidden);
        expect(read('services/commerce.js')).toMatch(/\/v1\/student\/commerce/);
        expect(read('pages/profile/index.js')).not.toContain('getUserProfile');
    });

    it('parses API datetimes only through academyTime toDate, which iOS can read', () => {
        for (const file of sources.filter((path) => path.endsWith('.js') && path !== 'core/academyTime.js')) {
            // Allowed: new Date(), epoch arithmetic (getTime(), Date.UTC, now) and ISO template literals.
            const parses = read(file).split('\n').filter((line) => /Date\.parse\(/.test(line)
                || (/new Date\((?!\))/.test(line) && !/getTime\(\)|Date\.UTC\(|new Date\(`|new Date\(now\b/.test(line)));
            expect(parses, file).toEqual([]);
        }
    });

    it('never logs at runtime; failures go through console.error only', () => {
        for (const file of sources.filter((path) => path.endsWith('.js'))) expect(read(file), file).not.toMatch(/console\.(log|info|debug)\(/);
    });

    it('styles use design tokens for colors, typography and icon sizes', () => {
        for (const file of sources.filter((path) => !generated.includes(relative('.', path)))) {
            const source = read(file);
            expect(source, `raw color in ${file}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
            if (file.endsWith('.scss')) {
                expect(source, `raw typography in ${file}`).not.toMatch(/font-size:\s*[0-9]+r?px|font-weight:\s*[0-9]+|line-height:\s*[0-9.]+/i);
                expect(source, `rpx inside a media query in ${file}`).not.toMatch(/@media[^{]*rpx/);
            }
            if (file.endsWith('.wxml')) expect(source, `numeric icon size in ${file}`).not.toMatch(/<app-icon[^>]*\ssize="[0-9]/);
        }
    });

    it('ships exactly the exported line icons, each drawn from a design/icons source', () => {
        const pngs = readdirSync(join(root, 'imgs/icons')).map((file) => file.replace(/\.png$/, '')).sort();
        expect(pngs).toEqual(Object.keys(ICONS).sort());
        for (const { source } of Object.values(ICONS)) {
            expect(read(`../design/icons/${source}.svg`), source).toMatch(/stroke-linecap="round"/);
        }
        const whitelist = [...read('components/app-icon/index.js').split('new Set([')[1].split(']);')[0].matchAll(/'([a-z-]+)'/g)].map(([, name]) => name);
        expect(whitelist.filter((name) => !pngs.includes(name))).toEqual([]);
        expect(readdirSync(join(root, 'imgs'))).not.toContain('empty');
    });

    it('every scss file imports the tokens it uses, since DevTools also compiles partials standalone', () => {
        const reachesTokens = (file, seen = new Set()) => {
            if (file === 'styles/_tokens.scss') return true;
            if (seen.has(file)) return false;
            seen.add(file);
            return [...read(file).matchAll(/@import '([^']+)';/g)].some(([, target]) => {
                const path = join(dirname(file), target);
                return reachesTokens(join(dirname(path), `_${basename(path)}.scss`), seen);
            });
        };
        for (const file of sources.filter((path) => path.endsWith('.scss') && !generated.includes(path))) {
            if (/\$ky-/.test(read(file))) expect(reachesTokens(file), `${file} uses $ky- tokens without importing them`).toBe(true);
        }
    });
});
