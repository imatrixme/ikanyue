import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
execFileSync(process.execPath, ['scripts/check-weapp-output.mjs'], {
    cwd: projectRoot,
    stdio: 'pipe',
});

const appConfig = JSON.parse(await readFile(new URL('../../dist/app.json', import.meta.url), 'utf8'));
const packageConfig = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const commonBundle = await readFile(new URL('../../dist/common.js', import.meta.url), 'utf8');
const tokenEntrySource = await readFile(new URL('../../src/styles/_tokens.scss', import.meta.url), 'utf8');
const tokenSource = await readFile(new URL('../../src/styles/_brand.generated.scss', import.meta.url), 'utf8');
const themeSource = await readFile(new URL('../../src/styles/theme.mjs', import.meta.url), 'utf8');
const emptyStateSource = await readFile(new URL('../../src/components/EmptyState.vue', import.meta.url), 'utf8');
const appIconSource = await readFile(new URL('../../src/components/AppIcon.vue', import.meta.url), 'utf8');
const activityTicketSource = await readFile(new URL('../../src/components/ActivityTicket.vue', import.meta.url), 'utf8');
const accountRowSource = await readFile(new URL('../../src/components/AccountRow.vue', import.meta.url), 'utf8');
const pointsPassSource = await readFile(new URL('../../src/components/PointsPass.vue', import.meta.url), 'utf8');
const rewardVoucherSource = await readFile(new URL('../../src/components/RewardVoucher.vue', import.meta.url), 'utf8');
const ticketSectionSource = await readFile(new URL('../../src/components/TicketSection.vue', import.meta.url), 'utf8');
const asyncStateSource = await readFile(new URL('../../src/components/AsyncState.vue', import.meta.url), 'utf8');
const formRowSource = await readFile(new URL('../../src/components/FormRow.vue', import.meta.url), 'utf8');
const mediaThumbSource = await readFile(new URL('../../src/components/MediaThumb.vue', import.meta.url), 'utf8');
const pageChromeSource = await readFile(new URL('../../src/components/PageChrome.vue', import.meta.url), 'utf8');
const pageHeaderSource = await readFile(new URL('../../src/components/PageHeader.vue', import.meta.url), 'utf8');
const paginationStateSource = await readFile(new URL('../../src/components/PaginationState.vue', import.meta.url), 'utf8');
const pointEventRowSource = await readFile(new URL('../../src/components/PointEventRow.vue', import.meta.url), 'utf8');
const sectionHeaderSource = await readFile(new URL('../../src/components/SectionHeader.vue', import.meta.url), 'utf8');
const segmentedControlSource = await readFile(new URL('../../src/components/SegmentedControl.vue', import.meta.url), 'utf8');
const stickyActionBarSource = await readFile(new URL('../../src/components/StickyActionBar.vue', import.meta.url), 'utf8');
const pointsSource = await readFile(new URL('../../src/pages/points/index.vue', import.meta.url), 'utf8');
const pointsRewardListSource = await readFile(new URL('../../src/pages/points/_reward-list.scss', import.meta.url), 'utf8');
const profileSource = await readFile(new URL('../../src/pages/profile/index.vue', import.meta.url), 'utf8');
const kanyueInfoLinksSource = await readFile(new URL('../../src/data/kanyueInfoLinks.js', import.meta.url), 'utf8');
const iconGeneratorSource = await readFile(new URL('../../scripts/generate-icons.mjs', import.meta.url), 'utf8');
const heroTextureSource = await readFile(new URL('../../src/styles/_hero-texture.scss', import.meta.url), 'utf8');
const heroTextureArtworkSource = await readFile(new URL('../../assets-src/imagegen/icons-v2/hero-music.svg', import.meta.url), 'utf8');
const heroTextureAsset = await readFile(new URL('../../dist/imgs/textures/hero-music.png', import.meta.url));
const vendorsBundle = await readFile(new URL('../../dist/vendors.js', import.meta.url), 'utf8');
const activityBundle = await readFile(new URL('../../dist/pages/activity/index.js', import.meta.url), 'utf8');
const activityTemplate = await readFile(new URL('../../dist/pages/activity/index.wxml', import.meta.url), 'utf8');
const activityStyleSource = await readFile(new URL('../../src/pages/activity/index.scss', import.meta.url), 'utf8');
const activityDetailBundle = await readFile(new URL('../../dist/pages/activityDetail/index.js', import.meta.url), 'utf8');
const activityDetailHtmlSource = await readFile(new URL('../../src/pages/activityDetail/htmlUtils.js', import.meta.url), 'utf8');
const imageDetailBundle = await readFile(new URL('../../dist/pages/imageDetail/index.js', import.meta.url), 'utf8');
const pointsBundle = await readFile(new URL('../../dist/pages/points/index.js', import.meta.url), 'utf8');
const pointsStyle = await readFile(new URL('../../dist/pages/points/index.wxss', import.meta.url), 'utf8');
const pointsTemplate = await readFile(new URL('../../dist/pages/points/index.wxml', import.meta.url), 'utf8');
const pointsHistoryBundle = await readFile(new URL('../../dist/pages/pointsHistory/index.js', import.meta.url), 'utf8');
const pointsHistoryStyle = await readFile(new URL('../../dist/pages/pointsHistory/index.wxss', import.meta.url), 'utf8');
const pointsHistoryTemplate = await readFile(new URL('../../dist/pages/pointsHistory/index.wxml', import.meta.url), 'utf8');
const rewardCatalogBundle = await readFile(new URL('../../dist/pages/rewardCatalog/index.js', import.meta.url), 'utf8');
const rewardCatalogStyle = await readFile(new URL('../../dist/pages/rewardCatalog/index.wxss', import.meta.url), 'utf8');
const rewardCatalogTemplate = await readFile(new URL('../../dist/pages/rewardCatalog/index.wxml', import.meta.url), 'utf8');
const profileBundle = await readFile(new URL('../../dist/pages/profile/index.js', import.meta.url), 'utf8');
const profileStyle = await readFile(new URL('../../dist/pages/profile/index.wxss', import.meta.url), 'utf8');
const profileTemplate = await readFile(new URL('../../dist/pages/profile/index.wxml', import.meta.url), 'utf8');
const coursesBundle = await readFile(new URL('../../dist/pages/courses/index.js', import.meta.url), 'utf8');
const coursesTemplate = await readFile(new URL('../../dist/pages/courses/index.wxml', import.meta.url), 'utf8');
const courseDetailBundle = await readFile(new URL('../../dist/pages/courseDetail/index.js', import.meta.url), 'utf8');
const courseDetailTemplate = await readFile(new URL('../../dist/pages/courseDetail/index.wxml', import.meta.url), 'utf8');
const courseLessonsBundle = await readFile(new URL('../../dist/pages/courseLessons/index.js', import.meta.url), 'utf8');
const courseLessonsTemplate = await readFile(new URL('../../dist/pages/courseLessons/index.wxml', import.meta.url), 'utf8');
const courseLessonDetailBundle = await readFile(new URL('../../dist/pages/courseLessonDetail/index.js', import.meta.url), 'utf8');
const courseLessonDetailTemplate = await readFile(new URL('../../dist/pages/courseLessonDetail/index.wxml', import.meta.url), 'utf8');
const courseRecordsBundle = await readFile(new URL('../../dist/pages/courseRecords/index.js', import.meta.url), 'utf8');
const courseRecordsTemplate = await readFile(new URL('../../dist/pages/courseRecords/index.wxml', import.meta.url), 'utf8');
const userinfoBundle = await readFile(new URL('../../dist/pages/userinfo/index.js', import.meta.url), 'utf8');
const userinfoStyle = await readFile(new URL('../../dist/pages/userinfo/index.wxss', import.meta.url), 'utf8');
const userinfoTemplate = await readFile(new URL('../../dist/pages/userinfo/index.wxml', import.meta.url), 'utf8');
const userinfoStyleSource = await readFile(new URL('../../src/pages/userinfo/index.scss', import.meta.url), 'utf8');
const userinfoSource = await readFile(new URL('../../src/pages/userinfo/index.vue', import.meta.url), 'utf8');
const accountIconNames = [
    'account-about',
    'account-name',
    'account-phone',
    'account-points',
    'account-profile',
    'account-rewards',
    'account-teaching',
];
const accountIconAssets = await Promise.all(accountIconNames.map((name) => (
    readFile(new URL(`../../src/imgs/icons/${name}.png`, import.meta.url))
)));
const activityConfig = JSON.parse(await readFile(new URL('../../dist/pages/activity/index.json', import.meta.url), 'utf8'));
const activityDetailConfig = JSON.parse(await readFile(new URL('../../dist/pages/activityDetail/index.json', import.meta.url), 'utf8'));
const pointsConfig = JSON.parse(await readFile(new URL('../../dist/pages/points/index.json', import.meta.url), 'utf8'));
const pointsHistoryConfig = JSON.parse(await readFile(new URL('../../dist/pages/pointsHistory/index.json', import.meta.url), 'utf8'));
const rewardCatalogConfig = JSON.parse(await readFile(new URL('../../dist/pages/rewardCatalog/index.json', import.meta.url), 'utf8'));
const profileConfig = JSON.parse(await readFile(new URL('../../dist/pages/profile/index.json', import.meta.url), 'utf8'));
const coursesConfig = JSON.parse(await readFile(new URL('../../dist/pages/courses/index.json', import.meta.url), 'utf8'));
const courseDetailConfig = JSON.parse(await readFile(new URL('../../dist/pages/courseDetail/index.json', import.meta.url), 'utf8'));
const courseLessonsConfig = JSON.parse(await readFile(new URL('../../dist/pages/courseLessons/index.json', import.meta.url), 'utf8'));
const courseLessonDetailConfig = JSON.parse(await readFile(new URL('../../dist/pages/courseLessonDetail/index.json', import.meta.url), 'utf8'));
const courseRecordsConfig = JSON.parse(await readFile(new URL('../../dist/pages/courseRecords/index.json', import.meta.url), 'utf8'));
const userinfoConfig = JSON.parse(await readFile(new URL('../../dist/pages/userinfo/index.json', import.meta.url), 'utf8'));
const sharedOutput = `${commonBundle}\n${vendorsBundle}`;
const pointsOutput = `${sharedOutput}\n${pointsBundle}\n${pointsTemplate}`;
const pointsHistoryOutput = `${sharedOutput}\n${pointsHistoryBundle}\n${pointsHistoryTemplate}`;
const rewardCatalogOutput = `${sharedOutput}\n${rewardCatalogBundle}\n${rewardCatalogTemplate}`;
const activityOutput = `${sharedOutput}\n${activityBundle}\n${activityTemplate}`;
const profileOutput = `${sharedOutput}\n${profileBundle}\n${profileTemplate}`;
const coursesOutput = `${sharedOutput}\n${coursesBundle}\n${coursesTemplate}`;
const courseDetailOutput = `${sharedOutput}\n${courseDetailBundle}\n${courseDetailTemplate}`;
const courseLessonsOutput = `${sharedOutput}\n${courseLessonsBundle}\n${courseLessonsTemplate}`;
const courseLessonDetailOutput = `${sharedOutput}\n${courseLessonDetailBundle}\n${courseLessonDetailTemplate}`;
const courseRecordsOutput = `${sharedOutput}\n${courseRecordsBundle}\n${courseRecordsTemplate}`;
const userinfoOutput = `${sharedOutput}\n${userinfoBundle}\n${userinfoTemplate}`;

assert.equal(packageConfig.scripts['prebuild:weapp'], 'node scripts/clean-weapp-output.mjs');
assert.match(packageConfig.scripts['build:weapp'], /check-weapp-output\.mjs/);

function assertCompiledText(output, expected) {
    const escaped = [...expected]
        .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
        .join('');
    const normalizedOutput = output.toLowerCase();
    assert.equal(
        output.includes(expected) || normalizedOutput.includes(escaped.toLowerCase()),
        true,
        `expected compiled page text missing: ${expected}`,
    );
}

async function collectThemeSourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const target = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
        if (entry.isDirectory()) return collectThemeSourceFiles(target);
        return /\.(js|mjs|scss|vue)$/.test(entry.name) ? [target] : [];
    }));
    return files.flat();
}

assert.deepEqual(appConfig.pages, [
    'pages/activity/index',
    'pages/courses/index',
    'pages/points/index',
    'pages/profile/index',
    'pages/courseDetail/index',
    'pages/courseLessons/index',
    'pages/courseLessonDetail/index',
    'pages/courseRecords/index',
    'pages/pointsHistory/index',
    'pages/rewardCatalog/index',
    'pages/userinfo/index',
    'pages/activityDetail/index',
    'pages/imageDetail/index',
    'pages/webview/index',
]);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.pagePath), [
    'pages/activity/index',
    'pages/courses/index',
    'pages/points/index',
    'pages/profile/index',
]);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.text), ['活动', '课程', '积分', '我的']);
assert.equal(appConfig.tabBar.color, '#5f6f69');
assert.equal(appConfig.tabBar.selectedColor, '#006241');
assert.deepEqual(appConfig.tabBar.list.map((item) => item.iconPath), [
    'imgs/icons/tab-activity.png',
    'imgs/icons/account-teaching.png',
    'imgs/icons/tab-points.png',
    'imgs/icons/tab-profile.png',
]);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.selectedIconPath), [
    'imgs/icons/tab-activity-selected.png',
    'imgs/icons/account-teaching.png',
    'imgs/icons/tab-points-selected.png',
    'imgs/icons/tab-profile-selected.png',
]);

[activityConfig, pointsConfig, pointsHistoryConfig, rewardCatalogConfig].forEach((pageConfig) => {
    assert.equal(pageConfig.backgroundColorTop, '#f4f4f2');
    assert.equal(pageConfig.backgroundColorBottom, '#f4f4f2');
    assert.equal(pageConfig.backgroundTextStyle, 'dark');
});
[profileConfig, userinfoConfig, coursesConfig, courseDetailConfig, courseLessonsConfig,
    courseLessonDetailConfig, courseRecordsConfig].forEach((pageConfig) => {
    assert.equal(pageConfig.backgroundColorTop, '#006241');
    assert.equal(pageConfig.backgroundColorBottom, '#f4f4f2');
    assert.equal(pageConfig.backgroundTextStyle, 'light');
});
assert.equal(activityConfig.enablePullDownRefresh, true);
assert.equal(activityConfig.disableScroll, undefined);
assert.equal(activityDetailConfig.enablePullDownRefresh, true);
assert.equal(activityDetailConfig.backgroundColorTop, '#f4f4f2');
assert.equal(pointsConfig.enablePullDownRefresh, true);
assert.equal(pointsHistoryConfig.enablePullDownRefresh, true);
assert.equal(pointsHistoryConfig.onReachBottomDistance, 120);
assert.equal(rewardCatalogConfig.enablePullDownRefresh, true);
assert.equal(profileConfig.enablePullDownRefresh, true);
assert.equal(userinfoConfig.enablePullDownRefresh, true);
[coursesConfig, courseDetailConfig, courseLessonsConfig, courseLessonDetailConfig, courseRecordsConfig].forEach((pageConfig) => {
    assert.equal(pageConfig.enablePullDownRefresh, true);
    assert.equal(pageConfig.navigationBarBackgroundColor, '#006241');
});
assert.equal(courseLessonsConfig.onReachBottomDistance, 120);
assert.equal(courseRecordsConfig.onReachBottomDistance, 120);
assert.equal((activityBundle.match(/"scroll-view"/g) || []).length, 0);
assert.equal((activityDetailBundle.match(/"scroll-view"/g) || []).length, 1);
assert.equal(imageDetailBundle.includes('"scroll-view"'), false);

assert.match(commonBundle, /\/v1\/activity\/find/);
assert.match(commonBundle, /\/v1\/points\/me/);
assert.match(commonBundle, /\/v1\/reward-items/);
assert.match(commonBundle, /\/v1\/user\/update/);
assert.match(commonBundle, /\/v1\/student\/learning\/overview/);
assert.match(commonBundle, /\/v1\/student\/learning\/courses/);
assert.match(commonBundle, /\/v1\/student\/learning\/lessons/);
assert.match(commonBundle, /\/v1\/student\/learning\/records/);
assert.equal(commonBundle.includes('/v1/course-credits'), false);
assertCompiledText(activityOutput, '暂无近期活动');
assertCompiledText(activityOutput, '活动暂时无法加载');
assertCompiledText(commonBundle, '看乐教学');
assertCompiledText(commonBundle, '关于看乐');
assert.equal(pointsOutput.includes('看乐积分'), false);
assert.equal(pointsOutput.includes('刷新积分'), false);
assert.equal(pointsOutput.includes('打开个人资料'), false);
assert.equal(pointsOutput.includes('前往登录'), false);
assertCompiledText(pointsOutput, '现在可领取');
assertCompiledText(pointsOutput, '全部实物');
assertCompiledText(pointsOutput, '查看更多');
assertCompiledText(pointsOutput, '还差');
assertCompiledText(pointsOutput, '重新加载');
assertCompiledText(pointsOutput, '可用积分');
assertCompiledText(pointsOutput, '件可领取');
assertCompiledText(pointsOutput, '积分记录');
assertCompiledText(pointsOutput, '余额');
assertCompiledText(pointsOutput, '全部');
assertCompiledText(pointsOutput, '登录后查看积分账户');
assertCompiledText(pointsOutput, '暂无积分记录');
assertCompiledText(pointsHistoryOutput, '积分明细');
assertCompiledText(pointsHistoryOutput, '已加载');
assertCompiledText(pointsHistoryOutput, '已显示全部记录');
assertCompiledText(pointsHistoryOutput, '暂无积分记录');
assertCompiledText(rewardCatalogOutput, '实物列表');
assertCompiledText(rewardCatalogOutput, '全部');
assertCompiledText(rewardCatalogOutput, '可兑换');
assertCompiledText(rewardCatalogOutput, '未达到');
assertCompiledText(rewardCatalogOutput, '已解锁全部实物');
assertCompiledText(profileOutput, 'MUSICIAN PROFILE');
assertCompiledText(profileOutput, 'MUSICIAN 01');
assertCompiledText(profileOutput, '积分账户');
assertCompiledText(profileOutput, '账号资料');
assertCompiledText(profileOutput, '登录你的看乐账户');
assertCompiledText(profileOutput, '进入修改');
assertCompiledText(profileOutput, '了解看乐');
assertCompiledText(profileOutput, '看乐教学');
assertCompiledText(profileOutput, '关于看乐');
assertCompiledText(profileOutput, '查看我的课程');
assertCompiledText(coursesOutput, '我的课程');
assertCompiledText(coursesOutput, '即将上课');
assertCompiledText(coursesOutput, '剩余课时');
assertCompiledText(coursesOutput, '课时记录');
assertCompiledText(courseDetailOutput, '课时来源');
assertCompiledText(courseDetailOutput, '课程日程');
assertCompiledText(courseLessonsOutput, '即将上课');
assertCompiledText(courseLessonsOutput, '已完成');
assertCompiledText(courseLessonDetailOutput, '课堂信息');
assertCompiledText(courseLessonDetailOutput, '出勤结果');
assertCompiledText(courseRecordsOutput, '课时记录');
assert.equal(coursesOutput.includes('/api/collections/'), false);
assert.equal(courseLessonsOutput.includes('studentId='), false);
['课程点', '批次', '冻结', '兑换', '预约', '充值'].forEach((forbiddenTerm) => {
    assert.equal(
        `${coursesOutput}\n${courseDetailOutput}\n${courseLessonsOutput}\n${courseLessonDetailOutput}\n${courseRecordsOutput}`.includes(forbiddenTerm),
        false,
        `student course vocabulary leaked: ${forbiddenTerm}`,
    );
});
assert.match(profileSource, /<\/template>\s*<ticket-section class="profile-info-section"/);
assertCompiledText(userinfoOutput, '个人资料');
assertCompiledText(userinfoOutput, '保存资料');
assertCompiledText(userinfoOutput, '退出登录');
['PLAYER PROFILE', 'PLAYER 01', 'SIGNAL LOST', 'FIRST NOTE', 'ALL CLEAR'].forEach((legacyCopy) => {
    assert.equal(`${activityOutput}\n${pointsOutput}\n${pointsHistoryOutput}\n${rewardCatalogOutput}\n${profileOutput}`.includes(legacyCopy), false, `game-like copy leaked: ${legacyCopy}`);
});
assert.equal(profileOutput.includes('退出当前账号'), false, 'logout action must remain inside the account details page');

assert.match(tokenSource, /\$ky-primary: #00754a;/);
assert.match(tokenSource, /\$ky-primary-strong: #006241;/);
assert.match(tokenSource, /\$ky-immersive-surface: #006241;/);
assert.match(tokenSource, /\$ky-primary-soft: #d4e9e2;/);
assert.match(tokenSource, /\$ky-ink-strong: #1e3932;/);
assert.equal(tokenSource.includes('$ky-red'), false);
assert.match(tokenEntrySource, /@import '\.\/brand\.generated';/);
assert.match(themeSource, /primary: '#00754a'/);
assert.match(themeSource, /primaryStrong: '#006241'/);
assert.match(themeSource, /immersiveSurface: '#006241'/);
assert.match(themeSource, /navigationBarBackgroundColor: themeColors\.immersiveSurface/);
assert.match(themeSource, /const richTextStyles = Object\.freeze/);
assert.match(themeSource, /const iconSizes = Object\.freeze/);
assert.match(themeSource, /"emptyCompact": 34/);
assert.match(themeSource, /paragraph: 'margin-bottom:12px;line-height:1\.75;'/);
assert.match(themeSource, /heading2: 'font-size:18px;font-weight:800;line-height:1\.35;margin:16px 0 8px;'/);
assert.match(themeSource, /danger: '#b42318'/);
assert.match(themeSource, /gold: '#7d6200'/);
assert.match(tokenSource, /\$ky-canvas: #f4f4f2;/);
assert.match(tokenSource, /\$ky-surface: #ffffff;/);
assert.match(tokenSource, /\$ky-blue: #0079c8;/);
assert.match(tokenSource, /\$ky-radius-lg: 8px;/);
assert.equal(activityTemplate.includes('activity-masthead'), false);
assert.match(activityStyleSource, /\.activity-calendar__days\s*\{[\s\S]*?grid-template-columns: repeat\(7,/);
assert.match(activityStyleSource, /\.activity-day--active \.activity-day__number\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(userinfoSource, /<segmented-control/);
assert.match(segmentedControlSource, /segmented-control__item--active/);
assert.match(segmentedControlSource, /background: \$ky-primary-strong;/);
assert.equal((pointsBundle.match(/"scroll-view"/g) || []).length, 0);
assert.equal((pointsBundle.match(/reward-tile--more/g) || []).length, 0);
[profileStyle, userinfoStyle].forEach((pageStyle) => {
    assert.equal(pageStyle.includes('/imgs/textures/hero-music.png'), false);
});
[pointsStyle, pointsHistoryStyle, rewardCatalogStyle].forEach((pageStyle) => {
    assert.equal(pageStyle.includes('/imgs/textures/hero-music.png'), false);
});
assert.match(`${pageHeaderSource}\n${profileSource}`, /hero-music\.png/);
assert.equal(heroTextureSource.includes('background-image'), false);
assert.match(heroTextureSource, /ky-hero-texture-layer/);
assert.match(pageHeaderSource, /page-header__texture/);
assert.match(profileSource, /profile-hero__texture/);
assert.equal(heroTextureAsset.length > 0, true);
assert.match(heroTextureArtworkSource, /opacity="0\.075"/);
assert.equal(`${commonBundle}\n${pointsOutput}\n${profileOutput}`.includes('empty-states'), false);
assert.equal(commonBundle.includes('empty-state__visual'), true);
assert.equal(emptyStateSource.includes('imgs/empty/'), true);
assert.match(emptyStateSource, /empty-state__visual/);
assert.match(emptyStateSource, /default-brand\.png/);
assert.match(emptyStateSource, /error-brand\.png/);
assert.match(emptyStateSource, /network-brand\.png/);
assert.match(appIconSource, /import \{ iconSizes \} from/);
assert.match(appIconSource, /type: String/);
accountIconNames.forEach((name, index) => {
    assert.match(appIconSource, new RegExp(`${name}\\.png`));
    assert.equal(accountIconAssets[index].length > 0, true, `empty account icon asset: ${name}`);
    assert.equal(commonBundle.includes(`${name}.png`), true, `account icon missing from bundle: ${name}`);
});
['PT', '礼', '名', '机', '档'].forEach((placeholder) => {
    assert.equal(
        `${pointsSource}\n${profileSource}\n${userinfoSource}`.includes(`icon-text="${placeholder}"`),
        false,
        `legacy text icon remains: ${placeholder}`,
    );
});
assert.match(profileSource, /icon="account-points"/);
assert.match(profileSource, /:icon="link\.icon"/);
assert.match(pointsSource, /icon="account-rewards"/);
assert.match(userinfoSource, /icon="account-phone"/);
assert.match(kanyueInfoLinksSource, /icon: 'account-teaching'/);
assert.match(kanyueInfoLinksSource, /icon: 'account-about'/);
assert.match(accountRowSource, /<app-icon v-if="icon" :name="icon" size="xl"/);
assert.match(accountRowSource, /\.account-row__leading \.app-icon\s*\{[\s\S]*?transform: scale\(1\.25\);/);
assert.match(pointsSource, /<app-icon name="account-rewards" size="xl"/);
assert.match(pointsSource, /<app-icon name="account-points" size="xl"/);
assert.match(pointsRewardListSource, /\.points-empty-row__icon \.app-icon\s*\{[\s\S]*?transform: scale\(1\.25\);/);
assert.equal(pointsSource.includes('name="empty-rewards"'), false);
assert.equal(pointsSource.includes('name="empty-points"'), false);
assert.equal(/<app-icon[^>]*(?::size="[0-9]+"|size="[0-9]+")/.test(`${emptyStateSource}\n${accountRowSource}\n${activityTicketSource}\n${sectionHeaderSource}\n${pointsBundle}\n${profileBundle}`), false);
assert.match(profileSource, /profile-member-pass/);
assert.match(profileSource, /class="login-popup-shell"/);
assert.equal(profileSource.includes('borderTopLeftRadius'), false);
assert.match(activityDetailHtmlSource, /import \{ richTextStyles \} from/);
assert.equal(activityDetailHtmlSource.includes('font-weight:bold'), false);
assert.equal(activityDetailHtmlSource.includes('font-size:20px'), false);
assert.equal(`${sharedOutput}\n${activityDetailBundle}`.includes('margin-bottom:12px;line-height:1.75;'), true);
assert.match(activityTicketSource, /ADMIT ONE/);
assert.match(activityTicketSource, /activity-ticket__stub/);
assert.match(pointsPassSource, /points-pass__seal/);
assert.match(pointsPassSource, /points-pass__texture/);
assert.match(pointsPassSource, /hero-music\.png/);
assert.match(rewardVoucherSource, /reward-voucher__status/);
assert.match(rewardVoucherSource, /<media-thumb/);
assert.match(activityTicketSource, /<media-thumb/);
assert.match(accountRowSource, /chevron-primary/);
assert.match(ticketSectionSource, /<section-header/);
assert.match(sectionHeaderSource, /section-header__action/);
assert.match(asyncStateSource, /<empty-state/);
assert.match(formRowSource, /form-row__control/);
assert.match(mediaThumbSource, /media-thumb__image/);
assert.match(pageChromeSource, /page-chrome--immersive/);
assert.match(pageChromeSource, /background: \$ky-immersive-surface/);
assert.match(pageHeaderSource, /page-header__title/);
assert.match(pageHeaderSource, /background-color: \$ky-immersive-surface/);
assert.equal(profileConfig.navigationBarBackgroundColor, '#006241');
assert.equal(userinfoConfig.navigationBarBackgroundColor, '#006241');
assert.match(paginationStateSource, /已加载/);
assert.match(pointEventRowSource, /point-event-row--spend/);
assert.match(stickyActionBarSource, /safe-area-inset-bottom/);
assert.equal(commonBundle.includes('chevron-blue'), false);
assert.match(iconGeneratorSource, /assets-src\/imagegen\/icons-v2/);
assert.match(iconGeneratorSource, /'tab-activity-selected\.svg'/);
assert.match(iconGeneratorSource, /'tab-points-selected\.svg'/);
assert.match(iconGeneratorSource, /'tab-profile-selected\.svg'/);
assert.match(iconGeneratorSource, /themeColors\.primaryStrong/);
assert.match(iconGeneratorSource, /'chevron-primary\.png'/);
assert.equal(iconGeneratorSource.includes('lucide-static'), false);
assert.equal(iconGeneratorSource.includes('empty-account.png'), false);

const colorSourceFiles = await collectThemeSourceFiles(new URL('../../src/', import.meta.url));
for (const sourceFile of colorSourceFiles) {
    if (
        sourceFile.pathname.endsWith('/styles/_tokens.scss')
        || sourceFile.pathname.endsWith('/styles/_brand.generated.scss')
        || sourceFile.pathname.endsWith('/styles/theme.mjs')
    ) continue;
    const source = await readFile(sourceFile, 'utf8');
    assert.equal(
        /#[0-9a-f]{3,8}\b|rgba?\(/i.test(source),
        false,
        `raw color must use a design token: ${sourceFile.pathname}`,
    );
    if (sourceFile.pathname.endsWith('.scss')) {
        assert.equal(
            /font-size:\s*[0-9]+px|font-weight:\s*[0-9]+|line-height:\s*[0-9.]+/i.test(source),
            false,
            `raw typography must use a design token: ${sourceFile.pathname}`,
        );
    }
    assert.equal(
        /<app-icon[^>]*(?::size="[0-9]+"|size="[0-9]+")/.test(source),
        false,
        `app icon size must use a named token: ${sourceFile.pathname}`,
    );
}
assert.equal(/#[0-9a-f]{3,8}\b|rgba?\(/i.test(iconGeneratorSource), false, 'icon generator must use theme colors');

if (process.env.EXPECTED_SERVICE_URL) {
    assert.equal(
        commonBundle.includes(process.env.EXPECTED_SERVICE_URL),
        true,
        `expected service URL missing from bundle: ${process.env.EXPECTED_SERVICE_URL}`,
    );
}

[
    '/v1/audioMaterial',
    '/v1/videoMaterial',
    'pages/audioMaterial',
    'pages/videoMaterial',
    'pages/pricing',
    'pages/prompt',
].forEach((legacyToken) => {
    assert.equal(commonBundle.includes(legacyToken), false, `legacy token leaked: ${legacyToken}`);
});

console.log('points-lite build e2e passed');
