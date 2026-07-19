import type { Activity } from '../../../app/types/content'
import { unwrapHonoData, type HonoResponse } from '../../utils/hono-response'

interface ActivityResponse {
  items?: Activity[]
}

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const url = new URL('/v1/activity/find', config.public.apiBase)
  url.searchParams.set('page', '1')
  url.searchParams.set('perPage', '24')

  const response = await $fetch<HonoResponse<ActivityResponse>>(url.toString(), {
    timeout: 5000,
  })
  const data = unwrapHonoData(response)

  return { items: Array.isArray(data.items) ? data.items : [] }
})
