import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../../dist/app.json', import.meta.url), 'utf8'));
const commonBundle = await readFile(new URL('../../dist/common.js', import.meta.url), 'utf8');
const pointsBundle = await readFile(new URL('../../dist/pages/points/index.js', import.meta.url), 'utf8');
const pointsTemplate = await readFile(new URL('../../dist/pages/points/index.wxml', import.meta.url), 'utf8');
const pointsOutput = `${pointsBundle}\n${pointsTemplate}`;

function assertCompiledText(output, expected) {
    const escaped = [...expected]
        .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
        .join('');
    assert.equal(
        output.includes(expected) || output.includes(escaped),
        true,
        `expected compiled page text missing: ${expected}`,
    );
}

assert.deepEqual(appConfig.pages, ['pages/points/index', 'pages/profile/index']);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.pagePath), ['pages/points/index', 'pages/profile/index']);
assert.deepEqual(appConfig.tabBar.list.map((item) => item.text), ['积分', '我的']);

assert.match(commonBundle, /\/v1\/points\/me/);
assert.match(commonBundle, /\/v1\/reward-items/);
assertCompiledText(pointsOutput, '现在可以领取');
assertCompiledText(pointsOutput, '继续积累');
assertCompiledText(pointsOutput, '还差');
assertCompiledText(pointsOutput, '重新加载');

if (process.env.EXPECTED_SERVICE_URL) {
    assert.equal(
        commonBundle.includes(process.env.EXPECTED_SERVICE_URL),
        true,
        `expected service URL missing from bundle: ${process.env.EXPECTED_SERVICE_URL}`,
    );
}

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
