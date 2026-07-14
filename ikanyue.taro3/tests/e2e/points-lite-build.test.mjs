import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../../dist/app.json', import.meta.url), 'utf8'));
const commonBundle = await readFile(new URL('../../dist/common.js', import.meta.url), 'utf8');
const commonStyle = await readFile(new URL('../../dist/common.wxss', import.meta.url), 'utf8');
const tokenSource = await readFile(new URL('../../src/styles/_tokens.scss', import.meta.url), 'utf8');
const emptyStateSource = await readFile(new URL('../../src/components/EmptyState.vue', import.meta.url), 'utf8');
const profileSource = await readFile(new URL('../../src/pages/profile/index.vue', import.meta.url), 'utf8');
const iconGeneratorSource = await readFile(new URL('../../scripts/generate-icons.mjs', import.meta.url), 'utf8');
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
const pointsHistoryTemplate = await readFile(new URL('../../dist/pages/pointsHistory/index.wxml', import.meta.url), 'utf8');
const rewardCatalogBundle = await readFile(new URL('../../dist/pages/rewardCatalog/index.js', import.meta.url), 'utf8');
const rewardCatalogTemplate = await readFile(new URL('../../dist/pages/rewardCatalog/index.wxml', import.meta.url), 'utf8');
const profileBundle = await readFile(new URL('../../dist/pages/profile/index.js', import.meta.url), 'utf8');
const profileTemplate = await readFile(new URL('../../dist/pages/profile/index.wxml', import.meta.url), 'utf8');
const userinfoBundle = await readFile(new URL('../../dist/pages/userinfo/index.js', import.meta.url), 'utf8');
const userinfoTemplate = await readFile(new URL('../../dist/pages/userinfo/index.wxml', import.meta.url), 'utf8');
const userinfoStyleSource = await readFile(new URL('../../src/pages/userinfo/index.scss', import.meta.url), 'utf8');
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
assert.equal(appConfig.tabBar.color, '#626262');
assert.equal(appConfig.tabBar.selectedColor, '#e60012');
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

[activityConfig, pointsConfig, pointsHistoryConfig, rewardCatalogConfig, profileConfig, userinfoConfig].forEach((pageConfig) => {
    assert.equal(pageConfig.backgroundColorTop, '#e60012');
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
assertCompiledText(pointsOutput, '现在可以领取');
assertCompiledText(pointsOutput, '继续积累');
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

assert.match(tokenSource, /\$ky-red: #e60012;/);
assert.match(tokenSource, /\$ky-canvas: #f4f4f2;/);
assert.match(tokenSource, /\$ky-surface: #ffffff;/);
assert.match(tokenSource, /\$ky-blue: #0079c8;/);
assert.match(tokenSource, /\$ky-radius-lg: 8px;/);
assert.equal(activityTemplate.includes('activity-masthead'), false);
assert.match(activityStyleSource, /\.date-scroll\s*\{[\s\S]*?flex-direction: column;/);
assert.match(activityStyleSource, /\.date-item\s*\{[\s\S]*?flex: 1;/);
assert.match(userinfoStyleSource, /\.userinfo-segmented__item--active\s*\{[\s\S]*?background: \$ky-red;/);
assert.equal(`${commonBundle}\n${commonStyle}\n${pointsStyle}`.includes('imgs/textures'), false);
assert.equal(`${commonBundle}\n${pointsOutput}\n${profileOutput}`.includes('empty-states'), false);
assert.equal(profileOutput.includes('empty-state__visual'), false);
assert.equal(emptyStateSource.includes('empty-state__icon'), false);
assert.match(emptyStateSource, /empty-state__illustration/);
assert.match(emptyStateSource, /imgs\/empty\/default\.png/);
assert.match(emptyStateSource, /imgs\/empty\/error\.png/);
assert.match(emptyStateSource, /imgs\/empty\/network\.png/);
assert.match(profileSource, /profile-entry-arrow/);
assert.equal(commonBundle.includes('chevron-blue'), true);
assert.match(iconGeneratorSource, /'ticket\.svg'/);
assert.match(iconGeneratorSource, /'medal\.svg'/);
assert.match(iconGeneratorSource, /'user-square\.svg'/);

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
