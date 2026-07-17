import type { Activity } from '../../../app/types/content'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing activity id' })

  const config = useRuntimeConfig()
  const url = new URL('/v1/activity/find', config.public.apiBase)
  url.searchParams.set('id', id)

  return await $fetch<Activity>(url.toString(), { timeout: 5000 })
})
