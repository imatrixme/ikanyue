const staticRoutes = ['/', '/courses', '/faculty', '/activities', '/stories', '/about', '/contact', '/privacy']

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  const urls = staticRoutes
    .map(route => `<url><loc>${config.public.siteUrl}${route}</loc><changefreq>weekly</changefreq></url>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
})
