// Renders the hand-drawn SVG sources in design/icons/ into the 96x96 PNGs the mini program loads
// (WeChat tab bars only accept bitmaps). Run: node scripts/export-icons.mjs
// Sources stroke with currentColor and mark pale fills with class="soft"; each output picks both colours.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sources = join(root, 'design/icons');
const output = join(root, 'miniprogram/imgs/icons');
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Colours follow design-system/brand-tokens.json semantic colours.
const primary = { color: '#00754a', soft: '#d4e9e2' };
const muted = { color: '#5f6f69', soft: 'none' };
const empty = { color: '#00754a', soft: '#ffffff' };

export const ICONS = {
    'tab-home': { source: 'home', color: '#66726d', soft: 'none' },
    'tab-home-selected': { source: 'home', color: '#00754a', soft: '#d4e9e2' },
    'tab-booking': { source: 'calendar-check', color: '#66726d', soft: 'none' },
    'tab-booking-selected': { source: 'calendar-check', color: '#00754a', soft: '#d4e9e2' },
    'tab-profile': { source: 'profile', color: '#66726d', soft: 'none' },
    'tab-profile-selected': { source: 'profile', color: '#00754a', soft: '#d4e9e2' },
    'tab-workbench': { source: 'workbench', color: '#66726d', soft: 'none' },
    'tab-workbench-selected': { source: 'workbench', color: '#00754a', soft: '#d4e9e2' },
    'account-about': { source: 'note', ...primary },
    'account-phone': { source: 'phone', ...primary },
    'account-points': { source: 'points', ...primary },
    'account-profile': { source: 'id-card', ...primary },
    'account-rewards': { source: 'gift', ...primary },
    'account-teaching': { source: 'book-open', ...primary },
    'booking-availability': { source: 'calendar-dots', ...primary },
    'booking-confirm': { source: 'check-circle', ...primary },
    'booking-decline': { source: 'x-circle', color: '#5f6f69', soft: '#eef3f1' },
    'booking-request': { source: 'clock-circle', color: '#7d6200', soft: '#fff8d6' },
    'chevron-primary': { source: 'chevron', ...primary },
    'clock-muted': { source: 'clock', ...muted },
    'course-alert': { source: 'alert-circle', color: '#7d6200', soft: '#fff8d6' },
    'course-book': { source: 'notebook', ...primary },
    'course-calendar': { source: 'calendar', ...primary },
    'course-history': { source: 'history', ...primary },
    'course-validity': { source: 'hourglass', ...primary },
    'info-blue': { source: 'info', color: '#0079c8', soft: '#eaf5fc' },
    'location-muted': { source: 'pin', ...muted },
    'teacher-role': { source: 'teacher', ...primary },
    'teacher-workbench': { source: 'workbench', ...primary },
    'empty-account': { source: 'profile', ...empty },
    'empty-activities': { source: 'calendar', ...empty },
    'empty-default': { source: 'tray', ...empty },
    'empty-error': { source: 'alert-circle', ...empty },
    'empty-image': { source: 'image', ...empty },
    'empty-network': { source: 'cloud-off', ...empty },
    'empty-points': { source: 'points', ...empty },
    'empty-rewards': { source: 'gift', ...empty },
};

function render(name, { source, color, soft }, workdir) {
    const svg = readFileSync(join(sources, `${source}.svg`), 'utf8').replace('<svg ', '<svg width="96" height="96" ');
    const page = join(workdir, `${name}.html`);
    writeFileSync(page, `<!doctype html><style>html,body{margin:0;background:transparent;color:${color}}svg{display:block}.soft{fill:${soft}}</style>${svg}`);
    execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
        '--window-size=96,96', `--screenshot=${join(output, `${name}.png`)}`, `file://${page}`,
    ], { stdio: 'ignore' });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const workdir = mkdtempSync(join(tmpdir(), 'ky-icons-'));
    try {
        for (const [name, spec] of Object.entries(ICONS)) render(name, spec, workdir);
    } finally {
        rmSync(workdir, { force: true, recursive: true });
    }
    const stale = readdirSync(output).filter((file) => !ICONS[file.replace(/\.png$/, '')]);
    console.log(`exported ${Object.keys(ICONS).length} icons${stale.length ? `; not in the set: ${stale.join(', ')}` : ''}`);
}
