import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: [
            'src/pages/courses/pageLogic.test.js',
            'src/pages/schedule/*.test.js',
            'utils/apis.test.js',
            'utils/rolemanager.test.js',
            'utils/schedulemanager.test.js',
            'utils/usermanager.test.js',
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: [
                'src/pages/courses/pageLogic.js',
                'src/pages/schedule/pageLogic.js',
                'utils/apis.js',
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
