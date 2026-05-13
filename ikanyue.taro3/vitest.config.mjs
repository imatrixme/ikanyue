import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.js', 'utils/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: [
                'src/pages/activityDetail/htmlUtils.js',
                'utils/favoriteManager.js',
                'utils/request.js',
                'utils/usermanager.js',
            ],
            thresholds: {
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
    },
});
