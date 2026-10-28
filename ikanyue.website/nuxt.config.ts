import tailwindcss from '@tailwindcss/vite'
import { designTokens } from './app/utils/brand.generated'
import { siteRouteRules } from './config/route-rules'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://127.0.0.1:1437',
      miniProgramUrl: process.env.NUXT_PUBLIC_MINI_PROGRAM_URL || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      titleTemplate: (title) => title ? `${title} | 看乐艺术` : '看乐艺术 KANYUE',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: designTokens.semanticColors.primary },
        { name: 'color-scheme', content: 'light' },
      ],
      link: [
        { rel: 'preload', href: '/images/vocal-community.webp', as: 'image', type: 'image/webp' },
      ],
    },
  },
  routeRules: siteRouteRules,
  nitro: {
    prerender: {
      routes: ['/sitemap.xml', '/robots.txt'],
    },
  },
})
