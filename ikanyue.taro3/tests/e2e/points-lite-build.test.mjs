import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../../dist/app.json', import.meta.url), 'utf8'));
const commonBundle = await readFile(new URL('../../dist/common.js', import.meta.url), 'utf8');

assert.deepEqual(appConfig.pages, ['pages/points/index', 'pages/profile/index']);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.pagePath), ['pages/points/index', 'pages/profile/index']);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.text), ['积分', '我的']);

assert.match(commonBundle, /\/v1\/points\/me/);
assert.match(commonBundle, /\/v1\/reward-items/);

[
    '/v1/activity',
    '/v1/audioMaterial',
    '/v1/videoMaterial',
    '/v1/user/update',
    'pages/activity',
    'pages/audioMaterial',
    'pages/videoMaterial',
    'pages/pricing',
    'pages/userinfo',
    'pages/webview',
    'pages/prompt',
    'pages/imageDetail',
].forEach((legacyToken) => {
    assert.equal(commonBundle.includes(legacyToken), false, `legacy token leaked: ${legacyToken}`);
});

console.log('points-lite build e2e passed');
