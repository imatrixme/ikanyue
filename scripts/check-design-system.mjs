import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokenPath = path.join(ROOT, 'design-system/brand-tokens.json');
const tokens = JSON.parse(await readFile(tokenPath, 'utf8'));

const scanRoots = [
    'ikanyue.taro3/src/components',
    'ikanyue.taro3/src/pages',
    'ikanyue.taro3/src/styles',
    'ikanyue.admin/src/components',
    'ikanyue.website/app/components',
    'ikanyue.website/app/pages',
    'ikanyue.website/app/assets/css',
];

const sourcePattern = /\.(?:css|js|mjs|scss|ts|tsx|vue)$/;
const generatedPattern = /(?:^|\/)_?brand\.generated\.(?:css|scss|ts)$|(?:^|\/)theme\.mjs$/;

async function collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectFiles(target);
        if (!sourcePattern.test(entry.name) || generatedPattern.test(target) || /\.(?:test|spec)\./.test(entry.name)) return [];
        return [target];
    }));
    return nested.flat();
}

await execFileAsync(process.execPath, [path.join(ROOT, 'scripts/sync-design-tokens.mjs'), '--check'], { cwd: ROOT });

const brandValues = new Set(Object.values(tokens.semantic.color).filter((value) => (
    typeof value === 'string' && /^(?:#|rgba?\()/.test(value)
)));
const violations = [];
const rawVisualPatterns = [
    {
        label: 'raw typography value',
        pattern: /(?:font-size|font-weight|line-height)\s*:\s*(?!0(?:[;"'])|\$|var\()[0-9]+(?:\.[0-9]+)?(?:px|rpx|rem|em)?\b|font-weight\s*:\s*(?:bold|normal)\b/gi,
    },
    {
        label: 'raw radius value',
        pattern: /border(?:-(?:top|right|bottom|left)){0,2}-radius\s*:\s*[0-9]+(?:\.[0-9]+)?(?:px|rpx|rem|em)\b/gi,
    },
];

for (const relativeRoot of scanRoots) {
    const files = await collectFiles(path.join(ROOT, relativeRoot));
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        for (const value of brandValues) {
            if (source.includes(value)) {
                violations.push(`${path.relative(ROOT, file)} contains raw brand value ${value}`);
            }
        }
        for (const { label, pattern } of rawVisualPatterns) {
            const matches = source.match(pattern) || [];
            for (const match of matches) violations.push(`${path.relative(ROOT, file)} contains ${label}: ${match}`);
        }
    }
}

if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
} else {
    console.log('Design token outputs and source usage are aligned.');
}
