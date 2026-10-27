import { normalizePublicCourseCatalog } from '../../utils/course-catalog'
import { unwrapHonoData, type HonoResponse } from '../../utils/hono-response'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const response = await $fetch<HonoResponse<unknown>>(
    new URL('/v1/public/course-catalog', config.public.apiBase).toString(),
    { timeout: 5000 },
  )
  return normalizePublicCourseCatalog(unwrapHonoData(response))
})
