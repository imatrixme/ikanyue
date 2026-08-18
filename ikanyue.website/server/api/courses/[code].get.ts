import { normalizePublicCourseDetail } from '../../utils/course-catalog'
import { unwrapHonoData, type HonoResponse } from '../../utils/hono-response'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') || ''
  const config = useRuntimeConfig()
  const path = `/v1/public/course-catalog/courses/${encodeURIComponent(code)}`
  const response = await $fetch<HonoResponse<unknown>>(
    new URL(path, config.public.apiBase).toString(),
    { timeout: 5000 },
  )
  return normalizePublicCourseDetail(unwrapHonoData(response))
})
