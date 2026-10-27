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
                'src/pages/points/pageLogic.js',
                'src/pages/courses/pageLogic.js',
                'src/pages/schedule/pageLogic.js',
                'src/pages/appointments/pageLogic.js',
                'utils/apis.js',
                'utils/request.js',
                'utils/rolemanager.js',
                'utils/schedulemanager.js',
                'utils/usermanager.js',
            ],
            statements: 95,
            branches: 95,
            functions: 95,
            lines: 95,
        },
    },
});
