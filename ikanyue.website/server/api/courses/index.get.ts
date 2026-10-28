import { normalizePublicCourseCatalog } from '../../utils/course-catalog'
import { unwrapApiData, type ApiResponse } from '../../utils/api-response'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const response = await $fetch<ApiResponse<unknown>>(
    new URL('/v1/public/course-catalog', config.public.apiBase).toString(),
    { timeout: 5000 },
  )
  return normalizePublicCourseCatalog(unwrapApiData(response))
})
