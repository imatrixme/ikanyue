import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ops': {
        target: process.env.KANYUE_LOCAL_API_ORIGIN || 'http://127.0.0.1:1337',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/app/api.ts',
        'src/app/courseApi.ts',
        'src/app/http.ts',
        'src/app/navigation.ts',
        'src/app/state.ts',
        'src/components/ops/AdminWorkspaceRoutes.tsx',
        'src/components/ops/ClassesWorkspace.tsx',
        'src/components/ops/CourseCatalogWorkspaces.tsx',
        'src/components/ops/CourseResourceWorkspace.tsx',
        'src/components/ops/DashboardWorkspace.tsx',
        'src/components/ops/EnrollmentsWorkspace.tsx',
        'src/components/ops/LessonsWorkspace.tsx',
        'src/components/ops/ReadOnlyCourseWorkspaces.tsx',
        'src/components/ops/StudentWorkspace.tsx',
        'src/components/ops/StudentsPanel.tsx',
      ],
    },
  },
})
