const fs = require('node:fs');
const path = require('node:path');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['src', 'scripts', 'pocketbase'];
const ROOT_CONFIG_FILES = ['package.json', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts']);
const CONFIG_EXTENSIONS = new Set(['.json', '.sh', '.yml', '.yaml']);
const HOOK_DIRECTORY = ['pb', 'hooks'].join('_');
const HOOK_FILE_SUFFIX = ['.pb', '.js'].join('');
const RECORD_HOOK_PREFIX = ['on', 'Record'].join('');
const FORBIDDEN_APIS = [
    ['router', 'Add'].join(''),
    ['on', 'Bootstrap'].join(''),
    ['on', 'Serve'].join(''),
    ['cron', 'Add'].join(''),
    ['run', 'InTransaction'].join(''),
];
const FORBIDDEN_API_PATTERN = new RegExp(
    `\\b(?:${FORBIDDEN_APIS.join('|')}|${RECORD_HOOK_PREFIX}\\w*)\\s*\\(`
);
const HOOK_RUNTIME_PATTERN = new RegExp(
    `(?:--hooksDir\\b|\\bhooksDir\\b|(?:^|[/\\\\])${HOOK_DIRECTORY}(?:[/\\\\]|$))`
);

function findPocketBaseHookViolations(root = BACKEND_ROOT) {
    const violations = [];
    const hookDirectories = new Set();
    const rootHookDirectory = path.join(root, HOOK_DIRECTORY);
    if (fs.existsSync(rootHookDirectory)) hookDirectories.add(rootHookDirectory);
    for (const scanRoot of SCAN_ROOTS) {
        const directory = path.join(root, scanRoot);
        if (!fs.existsSync(directory)) continue;
        for (const hookDirectory of namedDirectories(directory, HOOK_DIRECTORY)) {
            hookDirectories.add(hookDirectory);
        }
    }
    for (const hookDirectory of hookDirectories) {
        violations.push({ type: 'hook-directory', file: relative(root, hookDirectory) });
    }

    for (const scanRoot of SCAN_ROOTS) {
        const directory = path.join(root, scanRoot);
        if (!fs.existsSync(directory)) continue;
        for (const file of sourceFiles(directory)) {
            const relativeFile = relative(root, file);
            if (file.endsWith(HOOK_FILE_SUFFIX)) {
                violations.push({ type: 'hook-file', file: relativeFile });
                continue;
            }

            const extension = path.extname(file);
            const basename = path.basename(file);
            if (!SOURCE_EXTENSIONS.has(extension)
                && !CONFIG_EXTENSIONS.has(extension)
                && basename !== 'Dockerfile') continue;

            const source = fs.readFileSync(file, 'utf8');
            if (SOURCE_EXTENSIONS.has(extension) && FORBIDDEN_API_PATTERN.test(source)) {
                violations.push({ type: 'hook-api', file: relativeFile });
            }
            if ((CONFIG_EXTENSIONS.has(extension) || basename === 'Dockerfile')
                && HOOK_RUNTIME_PATTERN.test(source)) {
                violations.push({ type: 'hook-runtime-config', file: relativeFile });
            }
        }
    }

    for (const filename of ROOT_CONFIG_FILES) {
        const file = path.join(root, filename);
        if (!fs.existsSync(file)) continue;
        const source = fs.readFileSync(file, 'utf8');
        if (HOOK_RUNTIME_PATTERN.test(source)) {
            violations.push({ type: 'hook-runtime-config', file: filename });
        }
    }

    return violations.sort((left, right) => left.file.localeCompare(right.file)
        || left.type.localeCompare(right.type));
}

function assertNoPocketBaseBusinessHooks(root = BACKEND_ROOT) {
    const violations = findPocketBaseHookViolations(root);
    if (violations.length === 0) return true;
    const error = new Error(`PocketBase business hooks are forbidden: ${JSON.stringify(violations)}`);
    error.code = 'POCKETBASE_BUSINESS_HOOKS_FORBIDDEN';
    error.violations = violations;
    throw error;
}

function main(root = BACKEND_ROOT, logger = console) {
    try {
        assertNoPocketBaseBusinessHooks(root);
        logger.log('PocketBase business-hook guard passed');
        return 0;
    } catch (error) {
        logger.error(error.message);
        return 1;
    }
}

function sourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(target);
        return [target];
    });
}

function namedDirectories(directory, expectedName) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (!entry.isDirectory()) return [];
        const target = path.join(directory, entry.name);
        if (entry.name === expectedName) return [target];
        return namedDirectories(target, expectedName);
    });
}

function relative(root, target) {
    return path.relative(root, target).split(path.sep).join('/');
}

if (require.main === module) {
    process.exitCode = main();
}

module.exports = {
    assertNoPocketBaseBusinessHooks,
    findPocketBaseHookViolations,
    main,
};
