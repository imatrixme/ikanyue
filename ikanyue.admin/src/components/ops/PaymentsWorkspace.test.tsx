import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commerceApi, money, type FinanceSummary, type OrderDetail } from '../../app/commerceApi'
import { canAccessView } from '../../app/state'
import { PaymentsWorkspace } from './PaymentsWorkspace'

const summary: FinanceSummary = { provider: 'mock', captured: 80000, refunded: 0, refundReserved: 80000, fees: null, settled: null, mockEnabled: true }
const order = { id: 'o1', name: '钢琴4节课包', amount: 80000, refunded: 0, status: 'completed', refundPending: true, createdAt: '2026-09-01T00:00:00Z',
  student: { id: 's1', name: '小林', cellphone: '13800000001' } }
const detail: OrderDetail = { ...order, quote: { amount: 0, blocked: false, message: '' }, batches: [], audit: [], payment: null, paymentUnavailable: false,
  refunds: [{ id: 'business-refund', amount: 80000, status: 'processing', createdAt: '2026-09-01T00:00:00Z' }] }
afterEach(() => vi.restoreAllMocks())
beforeEach(() => vi.spyOn(commerceApi, 'orders').mockResolvedValue({ items: [order], page: 1, perPage: 20, totalPages: 1, totalItems: 1 }))
describe('payments workspace', () => {
  it('keeps four focused views, merges sync with reconciliation and simulates refunds inside the order', async () => {
    const user = userEvent.setup()
    vi.spyOn(commerceApi, 'finance').mockResolvedValue(summary)
    vi.spyOn(commerceApi, 'order').mockResolvedValue(detail)
    vi.spyOn(commerceApi, 'recover').mockResolvedValue({ orders: { unresolved: 1 }, refunds: { unresolved: 0 } })
    vi.spyOn(commerceApi, 'reconcile').mockResolvedValue({ findings: [] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const refund = vi.spyOn(commerceApi, 'mockRefund').mockResolvedValue({})
    render(<PaymentsWorkspace token="finance-token" />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['订单管理', '待处理', '课程商品', '账单对账'])
    expect(await screen.findByText('尚未提供')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '同步并核对' }))
    expect(await screen.findByText('同步完成：1 笔仍在处理，渠道记录一致')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /小林/ }))
    const dialog = await screen.findByRole('dialog', { name: '课程订单' })
    await user.click(await within(dialog).findByRole('button', { name: '模拟退款到账' }))
    await waitFor(() => expect(refund).toHaveBeenCalledWith('finance-token', 'business-refund'))
  })
  it('shows retryable failures and restricts finance navigation', async () => {
    vi.spyOn(commerceApi, 'finance').mockRejectedValue(new Error('支付服务不可用'))
    render(<PaymentsWorkspace token="token" />)
    expect(await screen.findByText('支付服务不可用')).toBeInTheDocument()
    expect(canAccessView({ id: 't', role: 'teacher', isAdmin: false, blocked: false, verified: true, nickName: '', realName: '', cellphone: '', courseCreditCapabilities: ['course_credit.teacher'] }, 'payments')).toBe(false)
    expect(money(1)).toBe('¥0.01')
  })
})
