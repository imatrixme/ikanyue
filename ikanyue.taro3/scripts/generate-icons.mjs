import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'node_modules/lucide-static/icons');
const OUTPUT_DIR = path.join(ROOT, 'src/imgs/icons');
const BUILD_DIR = path.join(ROOT, 'tmp/icon-build');

const COLORS = {
    blue: '#0079c8',
    danger: '#b42318',
    green: '#25834f',
    muted: '#626262',
    red: '#e60012',
    tab: '#626262',
};

const ICONS = [
    ['tab-activity.png', 'ticket.svg', COLORS.tab, 1.8],
    ['tab-activity-selected.png', 'ticket.svg', COLORS.red, 2.4],
    ['tab-points.png', 'medal.svg', COLORS.tab, 1.8],
    ['tab-points-selected.png', 'medal.svg', COLORS.red, 2.4],
    ['tab-profile.png', 'user-square.svg', COLORS.tab, 1.8],
    ['tab-profile-selected.png', 'user-square.svg', COLORS.red, 2.4],
    ['chevron-blue.png', 'chevron-right.svg', COLORS.blue, 1.8],
    ['chevron-red.png', 'chevron-right.svg', COLORS.red, 1.8],
    ['clock-muted.png', 'clock.svg', COLORS.muted, 1.8],
    ['empty-account.png', 'user-square.svg', COLORS.red, 2],
    ['empty-activities.png', 'ticket.svg', COLORS.red, 2],
    ['empty-image.png', 'image-off.svg', COLORS.blue, 2],
    ['empty-network.png', 'wifi-off.svg', COLORS.danger, 2],
    ['empty-points.png', 'medal.svg', COLORS.blue, 2],
    ['empty-rewards.png', 'gift.svg', COLORS.green, 2],
    ['info-blue.png', 'info.svg', COLORS.blue, 1.8],
    ['location-muted.png', 'map-pin.svg', COLORS.muted, 1.8],
    ['logout-red.png', 'log-out.svg', COLORS.danger, 1.8],
    ['people-muted.png', 'users-round.svg', COLORS.muted, 1.8],
];

function prepareSvg(source, color, strokeWidth = 1.8) {
    return source
        .replace(/<!--.*?-->\s*/gs, '')
        .replaceAll('currentColor', color)
        .replace('stroke-width="2"', `stroke-width="${strokeWidth}"`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(BUILD_DIR, { recursive: true });

for (const [outputName, sourceName, color, strokeWidth] of ICONS) {
    const sourcePath = path.join(SOURCE_DIR, sourceName);
    const buildPath = path.join(BUILD_DIR, `${outputName}.svg`);
    const outputPath = path.join(OUTPUT_DIR, outputName);
    const source = await readFile(sourcePath, 'utf8');

    await writeFile(buildPath, prepareSvg(source, color, strokeWidth));
    execFileSync('sips', ['-s', 'format', 'png', '-z', '96', '96', buildPath, '--out', outputPath], {
        stdio: 'ignore',
    });
}

await rm(BUILD_DIR, { force: true, recursive: true });
console.log(`Generated ${ICONS.length} icons in ${path.relative(ROOT, OUTPUT_DIR)}`);
