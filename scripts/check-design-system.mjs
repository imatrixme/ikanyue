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
    'ikanyue.admin/src/components',
    'ikanyue.website/app/components',
    'ikanyue.website/app/pages',
];

const sourcePattern = /\.(?:css|js|mjs|scss|ts|tsx|vue)$/;
const generatedPattern = /(?:^|\/)brand\.generated\.(?:css|scss|ts)$|(?:^|\/)theme\.mjs$/;

async function collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectFiles(target);
        if (!sourcePattern.test(entry.name) || generatedPattern.test(target)) return [];
        return [target];
    }));
    return nested.flat();
}

await execFileAsync(process.execPath, [path.join(ROOT, 'scripts/sync-design-tokens.mjs'), '--check'], { cwd: ROOT });

const brandValues = new Set(Object.values(tokens.semantic.color).filter((value) => (
    typeof value === 'string' && /^(?:#|rgba?\()/.test(value)
)));
const violations = [];

for (const relativeRoot of scanRoots) {
    const files = await collectFiles(path.join(ROOT, relativeRoot));
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        for (const value of brandValues) {
            if (source.includes(value)) {
                violations.push(`${path.relative(ROOT, file)} contains raw brand value ${value}`);
            }
        }
    }
}

if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
} else {
    console.log('Design token outputs and source usage are aligned.');
}
