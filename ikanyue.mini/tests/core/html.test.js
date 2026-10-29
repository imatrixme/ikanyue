import { describe, expect, it, vi } from 'vitest';
import { richTextStyles } from '../../miniprogram/styles/theme.js';
import { getSafeHtml, htmlToText } from '../../miniprogram/core/html.js';

describe('htmlToText', () => {
    it('removes tags, decodes entities, and preserves useful line breaks', () => {
        const html = '<p>声乐&nbsp;课程</p><div>Tom &amp; Jerry</div><ul><li>发声</li><li>节奏</li></ul>';

        expect(htmlToText(html)).toBe('声乐 课程\nTom & Jerry\n• 发声\n• 节奏');
    });

    it('returns an empty string for empty input', () => {
        expect(htmlToText('')).toBe('');
        expect(htmlToText(null)).toBe('');
        expect(htmlToText({})).toBe('');
    });

    it('falls back to stripping tags when text conversion throws', () => {
        const originalReplace = String.prototype.replace;
        const replace = vi
            .spyOn(String.prototype, 'replace')
            .mockImplementationOnce(() => {
                throw new Error('replace failed');
            })
            .mockImplementation(function (...args) {
                return originalReplace.apply(this, args);
            });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            expect(htmlToText('<p>活动</p>')).toBe('活动');
        } finally {
            replace.mockRestore();
            consoleError.mockRestore();
        }
    });
});

describe('getSafeHtml', () => {
    it('returns an empty string for empty input', () => {
        expect(getSafeHtml('')).toBe('');
    });

    it('removes unsafe tags and rewrites inline event attributes', () => {
        const html = [
            '<p onclick="alert(1)">活动介绍</p>',
            '<script>alert(1)</script>',
            '<style>body{display:none}</style>',
            '<iframe src="https://example.com"></iframe>',
            '<video src="video.mp4"></video>',
        ].join('');

        const safeHtml = getSafeHtml(html);

        expect(safeHtml).toContain('data-click="alert(1)"');
        expect(safeHtml).toContain(`style="${richTextStyles.paragraph}"`);
        expect(safeHtml).not.toContain('<script');
        expect(safeHtml).not.toContain('<style');
        expect(safeHtml).not.toContain('<iframe');
        expect(safeHtml).not.toContain('<video');
    });

    it('normalizes void tags and adds rich-text friendly styles', () => {
        const safeHtml = getSafeHtml('<h2>标题</h2><img src="cover.jpg"><br><hr>');

        expect(safeHtml).toContain(`<h2 style="${richTextStyles.heading2}">`);
        expect(safeHtml).toContain(`<img src="cover.jpg" style="${richTextStyles.image}" />`);
        expect(safeHtml).toContain('<br />');
        expect(safeHtml).toContain('<hr />');
        expect(safeHtml).not.toContain('/ style=');
    });

    it('removes source styling before applying the generated rich-text contract', () => {
        const safeHtml = getSafeHtml('<h2 style="font-size:64px;color:red">标题</h2>');

        expect(safeHtml).toContain(`<h2 style="${richTextStyles.heading2}">`);
        expect(safeHtml).not.toContain('64px');
        expect(safeHtml).not.toContain('color:red');
    });

    it('adds closing tags for simple unclosed containers', () => {
        expect(getSafeHtml('<p>第一段<div>内容<span>重点')).toMatch(/<\/p><\/div><\/span>$/);
    });

    it('falls back to plain text conversion when sanitizing throws', () => {
        const replace = vi.fn(() => {
            throw new Error('replace failed');
        });
        const htmlLike = { replace };
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            expect(getSafeHtml(htmlLike)).toBe('');
        } finally {
            consoleError.mockRestore();
        }
    });
});
