import { defineConfig } from 'vitest/config';

// Live flows against the local stack (`node scripts/native-stack.mjs up`); never part of `pnpm test`.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/live/**/*.live.js'],
        fileParallelism: false,
        testTimeout: 60000,
    },
});
