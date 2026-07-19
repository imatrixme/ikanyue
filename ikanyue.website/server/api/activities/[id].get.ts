import type { Activity } from '../../../app/types/content'
import { unwrapHonoData, type HonoResponse } from '../../utils/hono-response'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing activity id' })

  const config = useRuntimeConfig()
  const url = new URL('/v1/activity/find', config.public.apiBase)
  url.searchParams.set('id', id)

  const response = await $fetch<HonoResponse<Activity>>(url.toString(), { timeout: 5000 })
  return unwrapHonoData(response)
})
