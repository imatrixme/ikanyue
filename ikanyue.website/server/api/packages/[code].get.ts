import { normalizePublicPackage } from '../../utils/course-catalog'
import { unwrapApiData, type ApiResponse } from '../../utils/api-response'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') || ''
  const config = useRuntimeConfig()
  const path = `/v1/public/course-catalog/packages/${encodeURIComponent(code)}`
  const response = await $fetch<ApiResponse<unknown>>(
    new URL(path, config.public.apiBase).toString(),
    { timeout: 5000 },
  )
  return normalizePublicPackage(unwrapApiData(response))
})
