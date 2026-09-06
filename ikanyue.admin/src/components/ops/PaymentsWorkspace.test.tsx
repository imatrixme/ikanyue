import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commerceApi, money, moneyStatus, type FinanceSummary } from '../../app/commerceApi'
import { canAccessView } from '../../app/state'
import { PaymentsWorkspace } from './PaymentsWorkspace'

const summary: FinanceSummary = { provider: 'mock', captured: 80000, refunded: 0, refundReserved: 80000, fees: null, settled: null,
  mockEnabled: true, findings: [], payments: [{ id: 'p1', reference: 'o1', amount: 80000, status: 'succeeded', fulfillment: 'completed', name: '钢琴4节课包', createdAt: '2026-09-01T00:00:00Z', student: { name: '小林', cellphone: '13800000001' } }],
  refunds: [{ id: 'r1', reference: 'business-refund', amount: 80000, status: 'processing', name: '钢琴4节课包', createdAt: '2026-09-01T00:00:00Z', student: { name: '小林', cellphone: '13800000001' } }] }
afterEach(() => vi.restoreAllMocks())
beforeEach(() => vi.spyOn(commerceApi, 'orders').mockResolvedValue({ items: [], page: 1, perPage: 20, totalPages: 0, totalItems: 0 }))
describe('payments workspace', () => {
  it('shows names, separates mock money and null settlements, and confirms refund simulation', async () => {
    const user = userEvent.setup()
    vi.spyOn(commerceApi, 'finance').mockResolvedValue(summary)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const refund = vi.spyOn(commerceApi, 'mockRefund').mockResolvedValue({})
    render(<PaymentsWorkspace token="finance-token" />)
    await user.click(screen.getByRole('tab', { name: '收款记录' }))
    expect(await screen.findByText('钢琴4节课包')).toBeInTheDocument()
    expect(screen.getByText('小林 · 13800000001')).toBeInTheDocument()
    expect(screen.getByText('尚未提供')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '退款记录' }))
    await user.click(screen.getByRole('button', { name: '模拟退款到账' }))
    await waitFor(() => expect(refund).toHaveBeenCalledWith('finance-token', 'business-refund'))
    expect(await screen.findByText('已模拟退款到账')).toBeInTheDocument()
  })
  it('shows retryable failures and restricts finance navigation', async () => {
    vi.spyOn(commerceApi, 'finance').mockRejectedValue(new Error('支付服务不可用'))
    render(<PaymentsWorkspace token="token" />)
    expect(await screen.findByText('支付服务不可用')).toBeInTheDocument()
    expect(canAccessView({ id: 't', role: 'teacher', isAdmin: false, blocked: false, verified: true, nickName: '', realName: '', cellphone: '', courseCreditCapabilities: ['course_credit.teacher'] }, 'payments')).toBe(false)
    expect(money(1)).toBe('¥0.01')
    expect(moneyStatus({ ...summary.payments[0], fulfillment: 'granting' })).toBe('已收款，课时待到账')
  })
})
