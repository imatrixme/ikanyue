import type { Activity } from '../../../app/types/content'
import { normalizeActivityContent } from '../../utils/activity-content'
import { unwrapApiData, type ApiResponse } from '../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing activity id' })

  const config = useRuntimeConfig()
  const url = new URL('/v1/activity/find', config.public.apiBase)
  url.searchParams.set('id', id)

  const response = await $fetch<ApiResponse<Activity>>(url.toString(), { timeout: 5000 })
  return normalizeActivityContent(unwrapApiData(response))
})
