import js from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

// Dependency direction: pages/components → services/core → kit → platform.
// Only kit/host.js sees the platform globals; core/ stays portable and never imports kit/.
const platformGlobals = { wx: 'readonly', App: 'readonly', Page: 'readonly', Component: 'readonly', getApp: 'readonly', getCurrentPages: 'readonly' };

export default defineConfig([
    globalIgnores(['node_modules', 'coverage']),
    {
        files: ['**/*.js', '**/*.mjs'],
        extends: [js.configs.recommended],
        languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } },
    },
    {
        files: ['miniprogram/kit/host.js'],
        languageOptions: { globals: platformGlobals },
    },
    {
        files: ['miniprogram/core/**/*.js'],
        rules: {
            'no-restricted-imports': ['error', { patterns: [{ group: ['**/kit/*', '**/services/*'], message: 'core/ is pure logic: no kit/ or services/ imports.' }] }],
        },
    },
    {
        files: ['tests/**/*.js', 'scripts/**/*.mjs', '*.config.js', '*.config.mjs'],
        // Tests run against the fake host installed by tests/setup/fake-host.js.
        languageOptions: { globals: { ...globals.node, ...platformGlobals } },
    },
]);
