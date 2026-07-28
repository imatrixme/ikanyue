module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  globals: {
    defineAppConfig: 'readonly',
    definePageConfig: 'readonly',
    SERVICE_URL: 'readonly',
    STAGE: 'readonly',
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-essential',
  ],
  ignorePatterns: [
    'coverage/',
    'dist/',
    'node_modules/',
    'output/',
    'tmp/',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
    'vue/multi-word-component-names': 'off',
  },
}
