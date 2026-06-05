import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/App.tsx',
        'src/entry-client.tsx',
        'src/entry-server.tsx',
        'src/app/mockData.ts',
        'src/app/resourceConfig.ts',
        'src/app/guidedWorkflowCatalog.ts',
        'src/app/guidedWorkflowDefinitions.ts',
        'src/app/guidedWorkflowTypes.ts',
        'src/app/types.ts',
      ],
    },
  },
})
