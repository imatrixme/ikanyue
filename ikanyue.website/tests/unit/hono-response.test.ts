import { describe, expect, it } from 'vitest'
import { unwrapHonoData } from '../../server/utils/hono-response'

describe('Hono response contract', () => {
  it('unwraps successful list and detail payloads', () => {
    expect(unwrapHonoData({ code: 10000, data: { items: [{ id: 'activity-1' }] } })).toEqual({
      items: [{ id: 'activity-1' }],
    })
    expect(unwrapHonoData({ code: 10000, data: { id: 'activity-1' } })).toEqual({ id: 'activity-1' })
  })

  it('rejects unsuccessful or missing upstream data', () => {
    expect(() => unwrapHonoData({ code: 10001, message: '查询失败' })).toThrow('查询失败')
    expect(() => unwrapHonoData({ code: 10000 })).toThrow('Invalid API response')
  })
})
