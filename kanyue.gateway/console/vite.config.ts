import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The build is embedded into kanyue.gateway (internal/console) and served on
// the admin plane at /console/; dev proxies the admin API to a local gateway.
const admin = process.env.KANYUE_GATEWAY_ADMIN || 'http://127.0.0.1:1461'

export default defineConfig({
  base: '/console/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: admin, changeOrigin: true },
      '/gateway': { target: admin, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
