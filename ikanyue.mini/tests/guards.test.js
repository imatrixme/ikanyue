import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../miniprogram/', import.meta.url).pathname;

function sources(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sources(path);
        return entry.name.endsWith('.js') ? [relative(root, path).split(sep).join('/')] : [];
    });
}

const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const files = sources(root).map((path) => ({ path, code: strip(readFileSync(join(root, path), 'utf8')) }));

// Dependency direction: pages/components → services/core → kit → platform.
export function platformViolations(list) {
    return list
        .filter(({ path }) => !path.startsWith('kit/'))
        .filter(({ code }) => /\bwx\.|\b(?:wx|App|Page|Component|getApp|getCurrentPages)\s*\(/.test(code))
        .map(({ path }) => path);
}

export function coreViolations(list) {
    return list
        .filter(({ path }) => path.startsWith('core/'))
        .filter(({ code }) => /\bfrom\s+['"][^'"]*\/(?:kit|services)\//.test(code) || /\bwx\b/.test(code))
        .map(({ path }) => path);
}

describe('platform boundary', () => {
    it('keeps platform calls inside kit/', () => {
        expect(platformViolations(files)).toEqual([]);
    });

    it('keeps core/ free of kit/, services/ and the platform', () => {
        expect(coreViolations(files)).toEqual([]);
    });

    it('catches violations', () => {
        const sample = [
            { path: 'pages/home/index.js', code: "wx.showToast({ title: 'x' })" },
            { path: 'services/request.js', code: 'Page({})' },
            { path: 'kit/api.js', code: 'wx.request({})' },
            { path: 'core/time.js', code: "import { ui } from '../kit/api.js';" },
        ];
        expect(platformViolations(sample)).toEqual(['pages/home/index.js', 'services/request.js']);
        expect(coreViolations(sample)).toEqual(['core/time.js']);
    });
});
