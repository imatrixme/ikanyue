import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeColors } from '../src/styles/theme.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'assets-src/imagegen/icons-v2');
const ICON_OUTPUT_DIR = path.join(ROOT, 'src/imgs/icons');
const TEXTURE_OUTPUT_DIR = path.join(ROOT, 'src/imgs/textures');
const BUILD_DIR = path.join(ROOT, 'tmp/icon-build');

const ICONS = [
    ['tab-activity.png', 'tab-activity.svg', themeColors.tab],
    ['tab-activity-selected.png', 'tab-activity-selected.svg', themeColors.primaryStrong],
    ['tab-courses.png', 'tab-courses.svg', themeColors.tab],
    ['tab-courses-selected.png', 'tab-courses.svg', themeColors.primaryStrong],
    ['tab-points.png', 'tab-points.svg', themeColors.tab],
    ['tab-points-selected.png', 'tab-points-selected.svg', themeColors.primaryStrong],
    ['tab-profile.png', 'tab-profile.svg', themeColors.tab],
    ['tab-profile-selected.png', 'tab-profile-selected.svg', themeColors.primaryStrong],
    ['chevron-primary.png', 'chevron-primary.svg', themeColors.primaryStrong],
    ['clock-muted.png', 'clock-muted.svg', themeColors.tab],
    ['info-blue.png', 'info-blue.svg', themeColors.blue],
    ['location-muted.png', 'location-muted.svg', themeColors.tab],
    ['logout-red.png', 'logout-red.svg', themeColors.danger],
    ['people-muted.png', 'people-muted.svg', themeColors.tab],
];

const TEXTURES = [
    ['hero-music.png', 'hero-music.svg', themeColors.surface, 512],
];

const LEGACY_OUTPUTS = ['chevron-blue.png', 'chevron-red.png'];

async function renderAsset(sourceName, outputPath, color, size) {
    const source = await readFile(path.join(SOURCE_DIR, sourceName), 'utf8');
    const buildPath = path.join(BUILD_DIR, sourceName);

    await writeFile(buildPath, source.replaceAll('currentColor', color));
    execFileSync('sips', ['-s', 'format', 'png', '-z', `${size}`, `${size}`, buildPath, '--out', outputPath], {
        stdio: 'ignore',
    });
}

await Promise.all([
    mkdir(ICON_OUTPUT_DIR, { recursive: true }),
    mkdir(TEXTURE_OUTPUT_DIR, { recursive: true }),
    mkdir(BUILD_DIR, { recursive: true }),
]);
await Promise.all(LEGACY_OUTPUTS.map((outputName) => rm(path.join(ICON_OUTPUT_DIR, outputName), { force: true })));

for (const [outputName, sourceName, color] of ICONS) {
    await renderAsset(sourceName, path.join(ICON_OUTPUT_DIR, outputName), color, 96);
}

for (const [outputName, sourceName, color, size] of TEXTURES) {
    await renderAsset(sourceName, path.join(TEXTURE_OUTPUT_DIR, outputName), color, size);
}

await rm(BUILD_DIR, { force: true, recursive: true });
console.log(`Generated ${ICONS.length} icons and ${TEXTURES.length} texture from imagegen art direction`);
