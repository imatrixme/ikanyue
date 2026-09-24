// Activities happen in Shanghai; render them there regardless of the server or visitor time zone.
export const ACADEMY_TIME_ZONE = 'Asia/Shanghai'

export function academyTime(value: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: ACADEMY_TIME_ZONE, ...options }).format(value)
}
