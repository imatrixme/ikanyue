import type { Activity } from '../../../app/types/content'
import { normalizeActivityContent } from '../../utils/activity-content'
import { unwrapApiData, type ApiResponse } from '../../utils/api-response'

interface ActivityResponse {
  items?: Activity[]
}

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const url = new URL('/v1/activity/find', config.public.apiBase)
  url.searchParams.set('page', '1')
  url.searchParams.set('perPage', '24')

  const response = await $fetch<ApiResponse<ActivityResponse>>(url.toString(), {
    timeout: 5000,
  })
  const data = unwrapApiData(response)

  return {
    items: Array.isArray(data.items) ? data.items.map(normalizeActivityContent) : [],
  }
})
