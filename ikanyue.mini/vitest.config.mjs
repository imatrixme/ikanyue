import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.js'],
        setupFiles: ['tests/setup/fake-host.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['miniprogram/kit/**/*.js', 'miniprogram/core/**/*.js', 'miniprogram/services/**/*.js'],
            thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
        },
    },
});
