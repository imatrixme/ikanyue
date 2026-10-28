import { createError } from 'h3'

export interface ApiResponse<T> {
  code: number
  message?: string
  data?: T
}

export function unwrapApiData<T>(response: ApiResponse<T>): T {
  if (response.code !== 10000 || response.data === undefined || response.data === null) {
    throw createError({
      statusCode: 502,
      message: response.message || 'Invalid API response',
    })
  }

  return response.data
}
