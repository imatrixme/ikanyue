import { afterEach, describe, expect, it, vi } from 'vitest'

import { PAYMENT_OFF, commerceApi } from './commerceApi'

const answer = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })

describe('commerce api', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('explains payment routes that are absent while online payment is off', async () => {
    vi.stubGlobal('fetch', answer(404, { code: 404, message: '接口不存在', data: null }))
    await expect(commerceApi.finance('token')).rejects.toThrow(PAYMENT_OFF)
    await expect(commerceApi.cases('token')).rejects.toThrow(PAYMENT_OFF)
  })

  it('keeps order center errors and other payment errors as the server wrote them', async () => {
    vi.stubGlobal('fetch', answer(404, { code: 404, message: '接口不存在', data: null }))
    await expect(commerceApi.order('token', 'o1')).rejects.toThrow('接口不存在')
    vi.stubGlobal('fetch', answer(400, { code: 400, message: '同步请求与原请求不一致', data: null }))
    await expect(commerceApi.recoverOrder('token', 'o1', '核对')).rejects.toThrow('同步请求与原请求不一致')
  })
})
