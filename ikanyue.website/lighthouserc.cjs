module.exports = {
  ci: {
    collect: {
      startServerCommand: 'PORT=4311 HOST=127.0.0.1 node .output/server/index.mjs',
      startServerReadyPattern: 'Listening on',
      url: [
        'http://127.0.0.1:4311/',
        'http://127.0.0.1:4311/courses',
        'http://127.0.0.1:4311/activities',
      ],
      numberOfRuns: 1,
      settings: { preset: 'desktop' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
}
