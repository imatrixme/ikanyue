import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../../dist/app.json', import.meta.url), 'utf8'));
const commonBundle = await readFile(new URL('../../dist/common.js', import.meta.url), 'utf8');
const commonStyle = await readFile(new URL('../../dist/common.wxss', import.meta.url), 'utf8');
const tokenEntrySource = await readFile(new URL('../../src/styles/_tokens.scss', import.meta.url), 'utf8');
const tokenSource = await readFile(new URL('../../src/styles/_brand.generated.scss', import.meta.url), 'utf8');
const themeSource = await readFile(new URL('../../src/styles/theme.mjs', import.meta.url), 'utf8');
const emptyStateSource = await readFile(new URL('../../src/components/EmptyState.vue', import.meta.url), 'utf8');
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
const profileSource = await readFile(new URL('../../src/pages/profile/index.vue', import.meta.url), 'utf8');
const iconGeneratorSource = await readFile(new URL('../../scripts/generate-icons.mjs', import.meta.url), 'utf8');
const heroTextureSource = await readFile(new URL('../../src/styles/_hero-texture.scss', import.meta.url), 'utf8');
const heroTextureArtworkSource = await readFile(new URL('../../assets-src/imagegen/icons-v2/hero-music.svg', import.meta.url), 'utf8');
const vendorsBundle = await readFile(new URL('../../dist/vendors.js', import.meta.url), 'utf8');
const activityBundle = await readFile(new URL('../../dist/pages/activity/index.js', import.meta.url), 'utf8');
const activityTemplate = await readFile(new URL('../../dist/pages/activity/index.wxml', import.meta.url), 'utf8');
const activityStyleSource = await readFile(new URL('../../src/pages/activity/index.scss', import.meta.url), 'utf8');
const activityDetailBundle = await readFile(new URL('../../dist/pages/activityDetail/index.js', import.meta.url), 'utf8');
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
const userinfoBundle = await readFile(new URL('../../dist/pages/userinfo/index.js', import.meta.url), 'utf8');
const userinfoStyle = await readFile(new URL('../../dist/pages/userinfo/index.wxss', import.meta.url), 'utf8');
const userinfoTemplate = await readFile(new URL('../../dist/pages/userinfo/index.wxml', import.meta.url), 'utf8');
const userinfoStyleSource = await readFile(new URL('../../src/pages/userinfo/index.scss', import.meta.url), 'utf8');
const userinfoSource = await readFile(new URL('../../src/pages/userinfo/index.vue', import.meta.url), 'utf8');
const activityConfig = JSON.parse(await readFile(new URL('../../dist/pages/activity/index.json', import.meta.url), 'utf8'));
const activityDetailConfig = JSON.parse(await readFile(new URL('../../dist/pages/activityDetail/index.json', import.meta.url), 'utf8'));
const pointsConfig = JSON.parse(await readFile(new URL('../../dist/pages/points/index.json', import.meta.url), 'utf8'));
const pointsHistoryConfig = JSON.parse(await readFile(new URL('../../dist/pages/pointsHistory/index.json', import.meta.url), 'utf8'));
const rewardCatalogConfig = JSON.parse(await readFile(new URL('../../dist/pages/rewardCatalog/index.json', import.meta.url), 'utf8'));
const profileConfig = JSON.parse(await readFile(new URL('../../dist/pages/profile/index.json', import.meta.url), 'utf8'));
const userinfoConfig = JSON.parse(await readFile(new URL('../../dist/pages/userinfo/index.json', import.meta.url), 'utf8'));
const sharedOutput = `${commonBundle}\n${vendorsBundle}`;
const pointsOutput = `${sharedOutput}\n${pointsBundle}\n${pointsTemplate}`;
const pointsHistoryOutput = `${sharedOutput}\n${pointsHistoryBundle}\n${pointsHistoryTemplate}`;
const rewardCatalogOutput = `${sharedOutput}\n${rewardCatalogBundle}\n${rewardCatalogTemplate}`;
const activityOutput = `${sharedOutput}\n${activityBundle}\n${activityTemplate}`;
const profileOutput = `${sharedOutput}\n${profileBundle}\n${profileTemplate}`;
const userinfoOutput = `${sharedOutput}\n${userinfoBundle}\n${userinfoTemplate}`;

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
    'pages/points/index',
    'pages/pointsHistory/index',
    'pages/rewardCatalog/index',
    'pages/profile/index',
    'pages/userinfo/index',
    'pages/activityDetail/index',
    'pages/imageDetail/index',
    'pages/webview/index',
]);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.pagePath), [
    'pages/activity/index',
    'pages/points/index',
    'pages/profile/index',
]);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.text), ['活动', '积分', '我的']);
assert.equal(appConfig.tabBar.color, '#5f6f69');
assert.equal(appConfig.tabBar.selectedColor, '#006241');
assert.deepEqual(appConfig.tabBar.list.map((item) => item.iconPath), [
    'imgs/icons/tab-activity.png',
    'imgs/icons/tab-points.png',
    'imgs/icons/tab-profile.png',
]);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.selectedIconPath), [
    'imgs/icons/tab-activity-selected.png',
    'imgs/icons/tab-points-selected.png',
    'imgs/icons/tab-profile-selected.png',
]);

[activityConfig, pointsConfig, pointsHistoryConfig, rewardCatalogConfig].forEach((pageConfig) => {
    assert.equal(pageConfig.backgroundColorTop, '#f4f4f2');
    assert.equal(pageConfig.backgroundColorBottom, '#f4f4f2');
    assert.equal(pageConfig.backgroundTextStyle, 'dark');
});
[profileConfig, userinfoConfig].forEach((pageConfig) => {
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
assert.equal((activityBundle.match(/"scroll-view"/g) || []).length, 0);
assert.equal((activityDetailBundle.match(/"scroll-view"/g) || []).length, 1);
assert.equal(imageDetailBundle.includes('"scroll-view"'), false);

assert.match(commonBundle, /\/v1\/activity\/find/);
assert.match(commonBundle, /\/v1\/points\/me/);
assert.match(commonBundle, /\/v1\/reward-items/);
assert.match(commonBundle, /\/v1\/user\/update/);
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
    assert.equal(pageStyle.includes('/imgs/textures/hero-music.png'), true);
});
[pointsStyle, pointsHistoryStyle, rewardCatalogStyle].forEach((pageStyle) => {
    assert.equal(pageStyle.includes('/imgs/textures/hero-music.png'), false);
});
assert.match(heroTextureSource, /hero-music\.png/);
assert.match(heroTextureSource, /background-repeat: repeat;/);
assert.match(heroTextureArtworkSource, /opacity="0\.075"/);
assert.equal(`${commonBundle}\n${pointsOutput}\n${profileOutput}`.includes('empty-states'), false);
assert.equal(commonBundle.includes('empty-state__visual'), true);
assert.equal(emptyStateSource.includes('imgs/empty/'), false);
assert.match(emptyStateSource, /empty-state__visual/);
assert.match(emptyStateSource, /empty-account/);
assert.match(emptyStateSource, /empty-activities/);
assert.match(emptyStateSource, /empty-network/);
assert.match(profileSource, /profile-member-pass/);
assert.match(activityTicketSource, /ADMIT ONE/);
assert.match(activityTicketSource, /activity-ticket__stub/);
assert.match(pointsPassSource, /points-pass__seal/);
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
