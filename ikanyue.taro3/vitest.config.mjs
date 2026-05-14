import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.js', 'utils/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: [
                'src/pages/activity/pageLogic.js',
                'src/pages/activityDetail/htmlUtils.js',
                'src/pages/audioMaterial/pageLogic.js',
                'src/pages/userinfo/pageLogic.js',
                'src/pages/videoMaterial/pageLogic.js',
                'utils/apis.js',
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
