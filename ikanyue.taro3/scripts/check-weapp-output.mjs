import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const outputDirectory = resolve(process.cwd(), process.env.WEAPP_OUTPUT_DIR || 'dist');

function collectJavaScriptFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScriptFiles(path);
        return extname(entry.name) === '.js' ? [path] : [];
    });
}

function parseChunkList(source) {
    return source
        .split(',')
        .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
}

if (!existsSync(outputDirectory)) {
    throw new Error('Missing dist output. Run the WeChat build first.');
}

const appConfigPath = join(outputDirectory, 'app.json');
const appConfig = JSON.parse(readFileSync(appConfigPath, 'utf8'));
const javascriptFiles = collectJavaScriptFiles(outputDirectory);
const providedChunks = new Set();
const requiredChunks = new Map();

for (const file of javascriptFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\.push\(\[\[([^\]]+)\]/g)) {
        parseChunkList(match[1]).forEach((chunk) => providedChunks.add(chunk));
    }
    for (const match of source.matchAll(/\.O\(0,\[([^\]]*)\]/g)) {
        const dependencies = parseChunkList(match[1]);
        if (dependencies.length) requiredChunks.set(relative(outputDirectory, file), dependencies);
    }
}

const missingPageFiles = appConfig.pages.flatMap((page) =>
    ['.js', '.wxml', '.wxss']
        .map((extension) => join(outputDirectory, `${page}${extension}`))
        .filter((file) => !existsSync(file))
        .map((file) => relative(outputDirectory, file)),
);

const missingChunks = [];
for (const [file, dependencies] of requiredChunks) {
    const missing = dependencies.filter((chunk) => !providedChunks.has(chunk));
    if (missing.length) missingChunks.push(`${file}: ${missing.join(', ')}`);
}

if (missingPageFiles.length || missingChunks.length) {
    const details = [
        ...missingPageFiles.map((file) => `missing page output: ${file}`),
        ...missingChunks.map((entry) => `missing webpack chunk: ${entry}`),
    ];
    throw new Error(`Invalid WeChat build output:\n${details.join('\n')}`);
}

console.log(
    `WeChat build output is complete: ${appConfig.pages.length} pages, ${providedChunks.size} chunks.`,
);
