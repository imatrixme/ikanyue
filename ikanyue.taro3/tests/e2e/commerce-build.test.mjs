import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canvasPageChrome } from '../../src/styles/theme.mjs';

const common = await readFile(new URL('../../dist/common.js', import.meta.url), 'utf8');
const config = JSON.parse(await readFile(new URL('../../dist/app.json', import.meta.url), 'utf8'));
for (const name of ['courseShop', 'courseOrder']) {
    const path = `pages/${name}/index`;
    const page = await readFile(new URL(`../../src/${path}.vue`, import.meta.url), 'utf8');
    assert.match(page, /<page-chrome[\s>]/, `${name} must use the shared page shell`);
    assert.doesNotMatch(page, /<page-header/, `${name} relies on the native navigation title`);
    for (const component of ['ticket-section', 'account-row', 'async-state']) {
        assert.ok(page.includes(`<${component}`), `${name} must reuse ${component}`);
    }
    assert.doesNotMatch(page, /commerce-heading/);
    const pageConfig = JSON.parse(await readFile(new URL(`../../dist/${path}.json`, import.meta.url), 'utf8'));
    for (const [key, value] of Object.entries(canvasPageChrome)) {
        assert.equal(pageConfig[key], value, `${name} native chrome must match the shared canvas chrome`);
    }
    assert.ok(config.pages.includes(path));
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
        const source = await readFile(new URL(`../../dist/${path}.${extension}`, import.meta.url), 'utf8');
        assert.ok(source.length > 0, `${path}.${extension} must not be empty`);
        if (extension === 'js') assert.doesNotMatch(source, /PAY_SERVICE_TOKEN|PAY_MOCK_TOKEN|\/_test\/observations|\/api\/collections\//);
    }
}
const courses = await readFile(new URL('../../src/pages/courses/index.vue', import.meta.url), 'utf8');
assert.match(courses, /<view v-if="state === 'empty'" class="courses-action-list courses-shop-entry">\s*<account-row[\s\S]*?@select="goShop"\s*\/>\s*<\/view>/,
    'learners without courses reach the shop from the empty state');
assert.match(courses, /<ticket-section title="预约与购买">\s*<view class="courses-action-list">[\s\S]*?@select="goShop"/,
    'enrolled learners reach the shop from the shared action list');
for (const name of ['courseShop', 'appointments', 'courseLessons']) {
    const page = await readFile(new URL(`../../src/pages/${name}/index.vue`, import.meta.url), 'utf8');
    assert.match(page, /<segmented-control/, `${name} must reuse the established compact tab geometry`);
    assert.doesNotMatch(page, /class="commerce-tab|class="appointments-filter/);
    if (name === 'appointments') {
        assert.match(page, /:model-value="statusFilter"[^>]+@change="selectFilter"/,
            'filter must reach selectFilter before statusFilter changes, so selecting a tab still reloads records');
    }
}
const styles = await readFile(new URL('../../src/pages/courseShop/_shared.scss', import.meta.url), 'utf8');
assert.doesNotMatch(styles, /\.commerce-tabs?\b/, 'page styles must not override shared tab geometry');
for (const token of ['control-height-touch', 'radius-md', 'radius-lg', 'shadow-button', 'disabled-opacity', 'focus-ring']) {
    assert.ok(styles.includes(`$ky-${token}`), `commerce controls must use ${token}`);
}
assert.match(styles, /env\(safe-area-inset-bottom\)/);
assert.doesNotMatch(styles, /(?:border-radius|min-height):\s*\d+px/, 'shared control geometry must not use raw pixel values');
assert.match(common, /\/v1\/student\/commerce/);
assert.doesNotMatch(common, /PAY_SERVICE_TOKEN|PAY_MOCK_TOKEN|PAY_PB_PASSWORD|\/_test\/observations/);
const orderSource = await readFile(new URL('../../src/pages/courseOrder/index.vue', import.meta.url), 'utf8');
assert.match(orderSource, /preview\.blocked/);
assert.match(orderSource, /Commerce\.refund\(this\.id, key, preview\.amount\)/);
assert.match(orderSource, /order\.mockPayment/);
console.log('Commerce build contracts passed: shared design components and tokens, two pages, business-only APIs, confirmed refund amounts, no gateway credentials.');
