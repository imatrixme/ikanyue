import { createError } from 'h3'

export interface HonoResponse<T> {
  code: number
  message?: string
  data?: T
}

export function unwrapHonoData<T>(response: HonoResponse<T>): T {
  if (response.code !== 10000 || response.data === undefined || response.data === null) {
    throw createError({
      statusCode: 502,
      message: response.message || 'Invalid API response',
    })
  }

  return response.data
}
