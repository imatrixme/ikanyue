import type { Activity } from '../../../app/types/content'

interface ActivityResponse {
  items?: Activity[]
}

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const url = new URL('/v1/activity/find', config.public.apiBase)
  url.searchParams.set('page', '1')
  url.searchParams.set('perPage', '24')

  const response = await $fetch<ActivityResponse>(url.toString(), {
    timeout: 5000,
  })

  return { items: Array.isArray(response.items) ? response.items : [] }
})
