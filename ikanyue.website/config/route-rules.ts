export const siteRouteRules = {
  '/': { swr: 300 },
  '/courses': { swr: 300 },
  '/courses/**': { swr: 300 },
  '/packages/**': { swr: 300 },
  '/faculty': { prerender: true },
  '/stories': { prerender: true },
  '/about': { prerender: true },
  '/contact': { prerender: true },
  '/privacy': { prerender: true },
  '/activities': { swr: 300 },
  '/activities/**': { swr: 300 },
} as const
