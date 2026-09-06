import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { commerceApi, type OrderDetail } from '../../app/commerceApi'
import { CommerceOrders } from './CommerceOrders'

afterEach(() => vi.restoreAllMocks())
const order: OrderDetail = { id: 'order', name: '声乐4节课包', student: { id: 's', name: '小林', cellphone: '13800000001' },
  amount: 80000, refunded: 10000, cancellationFees: 10000, status: 'completed', refundPending: false, createdAt: '2026-09-06T00:00:00Z',
  quote: { amount: 60000, blocked: false, message: '按购买时的实付金额退还未使用部分' }, batches: [], refunds: [],
  audit: [{ id: 'audit', actorId: 'operator', actorName: '王老师', action: 'reservation_cancelled', reason: '学员申请', createdAt: '2026-09-06T00:00:00Z' }],
  payment: { status: 'succeeded' }, paymentUnavailable: false }
it('requires a reason and confirmation, uses the quoted amount and exposes operator identity', async () => {
  const user = userEvent.setup()
  vi.spyOn(commerceApi, 'orders').mockResolvedValue({ items: [order], page: 1, perPage: 20, totalPages: 1, totalItems: 1 })
  vi.spyOn(commerceApi, 'order').mockResolvedValue(order)
  const refund = vi.spyOn(commerceApi, 'refundOrder').mockResolvedValue({})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<CommerceOrders token="finance" />)
  await user.click(await screen.findByRole('button', { name: /小林/ }))
  const submit = await screen.findByRole('button', { name: '确认退款' })
  expect(submit).toBeDisabled()
  expect(screen.getByText(/王老师/)).toBeInTheDocument()
  expect(screen.getByText(/取消预约扣费/)).toHaveTextContent('¥100.00')
  await user.type(screen.getByRole('textbox', { name: '处理原因' }), '学员申请退款')
  await user.click(submit)
  await waitFor(() => expect(refund).toHaveBeenCalledWith('finance', 'order', expect.objectContaining({ expectedAmount: 60000, reason: '学员申请退款' })))
})
it('keeps known order details and displays a recoverable refund failure', async () => {
  const user = userEvent.setup()
  vi.spyOn(commerceApi, 'orders').mockResolvedValue({ items: [order], page: 1, perPage: 20, totalPages: 1, totalItems: 1 })
  vi.spyOn(commerceApi, 'order').mockResolvedValue(order)
  vi.spyOn(commerceApi, 'refundOrder').mockRejectedValue(new Error('可退金额已变化，请重新确认'))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<CommerceOrders token="finance" />)
  await user.click(await screen.findByRole('button', { name: /小林/ }))
  await user.type(await screen.findByRole('textbox', { name: '处理原因' }), '学员申请退款')
  await user.click(screen.getByRole('button', { name: '确认退款' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('可退金额已变化')
  expect(screen.getByRole('dialog')).toHaveTextContent('声乐4节课包')
})
