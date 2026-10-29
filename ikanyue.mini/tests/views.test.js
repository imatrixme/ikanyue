import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static checks over every page and component: the WXML only uses portable template syntax,
// every event handler it names exists, and every custom tag is registered.
const root = new URL('../miniprogram/', import.meta.url).pathname;
const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const kitMethods = ['set', 'onField'];
const builtinTags = ['web-view', 'rich-text', 'scroll-view', 'movable-area', 'movable-view', 'cover-view', 'cover-image', 'page-container', 'root-portal'];

const views = [
    ...readdirSync(join(root, 'components')).map((name) => ({ kind: 'component', dir: `components/${name}` })),
    ...readdirSync(join(root, 'pages')).map((name) => ({ kind: 'page', dir: `pages/${name}` })),
];

async function registered(view) {
    const register = view.kind === 'page' ? Page : Component;
    register.mockClear();
    await import(join(root, view.dir, 'index.js'));
    return register.mock.calls.at(-1)?.[0];
}

function handlerNames(wxml) {
    return [...wxml.matchAll(/\s(?:bind|catch|capture-bind|capture-catch):?[a-z]+="([^"]*)"/g)].map((match) => match[1]);
}

// Render-layer handlers ({{module.fn}} in events and change:prop) must be exported by a declared <wxs> file.
function missingWxsHandlers(wxml, dir) {
    const modules = Object.fromEntries([...wxml.matchAll(/<wxs\s+module="(\w+)"\s+src="\.\/([\w.-]+)"/g)]
        .map(([, name, file]) => [name, readFileSync(join(root, dir, file), 'utf8')]));
    return [...wxml.matchAll(/\s(?:bind|catch|change):?[a-z]+="\{\{(\w+)\.(\w+)\}\}"/g)]
        .filter(([, name, fn]) => !new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${fn}\\s*:`).test(modules[name] || ''))
        .map(([, name, fn]) => `${name}.${fn}`);
}

export function templateProblems(wxml) {
    const problems = [];
    const expressions = [...wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((match) => match[1]);
    for (const expression of expressions) {
        if (/[\w$\]]\s*\(/.test(expression.replace(/'[^']*'/g, "''"))) problems.push(`function call in {{${expression}}}`);
        if (/`|\?\.|=>/.test(expression)) problems.push(`unsupported syntax in {{${expression}}}`);
    }
    if (/\sv-[a-z]+|\s[:@][a-z-]+=|TODO|<template\b/.test(wxml)) problems.push('Vue syntax left over');
    // Tags must nest and close; self-closing tags are allowed for every element.
    const open = [];
    for (const [tag, closing, name] of wxml.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-z][a-z0-9-]*)(?:"[^"]*"|[^>"])*>/g)) {
        if (tag.endsWith('/>')) continue;
        if (!closing) open.push(name);
        else if (open.at(-1) === name) open.pop();
        else problems.push(`unexpected </${name}>`);
    }
    if (open.length) problems.push(`unclosed <${open.join('> <')}>`);
    // Attribute values may contain `>`, so tags are scanned with their quoted values blanked out.
    for (const [, name, rawAttrs] of wxml.matchAll(/<([a-z][a-z-]*)((?:"[^"]*"|[^>"])*)>/g)) {
        const attrs = rawAttrs.replace(/"[^"]*"/g, '""');
        if (/\swx:for=/.test(attrs) && !/\swx:key=/.test(attrs)) problems.push(`wx:for without wx:key on <${name}>`);
        if (!name.includes('-') || builtinTags.includes(name)) continue;
        // Custom components are virtual hosts: identify rows with an item-id prop, not data-*.
        if (/\sdata-[a-z-]+=/.test(attrs)) problems.push(`data-* on <${name}>`);
        // A bare attribute on a custom component does not reliably mean true; write ="{{true}}".
        if (/\s[a-z][a-z-]*(?=\s|\/|$)(?!=)/.test(attrs)) problems.push(`bare attribute on <${name}>`);
    }
    return problems;
}

describe('views', () => {
    it.each(views)('$dir is a complete, portable view', async (view) => {
        for (const file of ['index.js', 'index.json', 'index.wxml']) expect(existsSync(join(root, view.dir, file)), file).toBe(true);
        const wxml = readFileSync(join(root, view.dir, 'index.wxml'), 'utf8');
        expect(templateProblems(wxml)).toEqual([]);

        const options = await registered(view);
        expect(options, 'registers itself').toBeTruthy();
        const methods = view.kind === 'page' ? options : options.methods;
        const missing = handlerNames(wxml).filter((name) => !name.startsWith('{{') && !kitMethods.includes(name) && typeof methods[name] !== 'function');
        expect(missing).toEqual([]);
        expect(missingWxsHandlers(wxml, view.dir)).toEqual([]);

        const local = JSON.parse(readFileSync(join(root, view.dir, 'index.json'), 'utf8')).usingComponents || {};
        const tags = [...new Set([...wxml.matchAll(/<([a-z]+-[a-z-]+)/g)].map((match) => match[1]))];
        expect(tags.filter((tag) => !builtinTags.includes(tag) && !app.usingComponents[tag] && !local[tag])).toEqual([]);
    });

    it('catches template mistakes', () => {
        expect(templateProblems('<text>{{format(a)}}</text>')).toHaveLength(1);
        expect(templateProblems('<text>{{a?.b}}</text>')).toHaveLength(1);
        expect(templateProblems('<view v-if="a" />')).toEqual(['Vue syntax left over']);
        expect(templateProblems('<view wx:for="{{list}}" />')).toHaveLength(1);
        expect(templateProblems("<view class=\"a {{b ? 'c' : ''}}\" wx:for=\"{{list}}\" wx:key=\"id\" />")).toEqual([]);
        expect(templateProblems('<account-row data-id="{{a}}" title="x" />')).toEqual(['data-* on <account-row>']);
        expect(templateProblems('<account-row interactive title="x" />')).toEqual(['bare attribute on <account-row>']);
        expect(templateProblems('<account-row interactive="{{true}}" title="a b" />\n<scroll-view scroll-x></scroll-view>')).toEqual([]);
        expect(templateProblems('<view><text>a</view>')).toEqual(['unexpected </view>', 'unclosed <view> <text>']);
        expect(templateProblems('<view wx:if="{{a > 1}}"><image src="x" /></view>')).toEqual([]);
    });
});
