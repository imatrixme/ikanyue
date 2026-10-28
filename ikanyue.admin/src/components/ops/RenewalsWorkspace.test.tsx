import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { RenewalsWorkspace } from './RenewalsWorkspace'

describe('renewals workspace', () => {
  it('sends a confirmed reminder once a day and shows the rules', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const send = vi.spyOn(api, 'sendRenewalReminders')
    render(<RenewalsWorkspace api={api} token="token" />)

    const table = await screen.findByRole('table', { name: '待续费学员' })
    expect(table).toHaveTextContent('张同学')
    expect(table).toHaveTextContent('课时不足')
    expect(table).toHaveTextContent('尚未提醒')
    expect(screen.getByText(/不含价格/)).toBeInTheDocument()

    await user.click(within(table).getByLabelText('选择张同学'))
    await user.click(screen.getByRole('button', { name: '发送续费提醒（1）' }))
    const dialog = screen.getByRole('dialog', { name: '发送续费提醒' })
    expect(dialog).toHaveTextContent('看乐教务')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))

    await waitFor(() => expect(send).toHaveBeenCalledWith('token', ['student_1']))
    const after = await screen.findByRole('table', { name: '待续费学员' })
    await waitFor(() => expect(within(after).getByRole('button', { name: '给张同学发送续费提醒' })).toBeDisabled())
    expect(after).toHaveTextContent('今日已提醒')
    expect(after).toHaveTextContent('手动 · 仅站内')
  })

  it('lists rejected students with their reason and keeps load errors retryable', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'sendRenewalReminders').mockResolvedValueOnce({ sent: 0, rejected: 1, items: [{ studentId: 'student_1', status: 'rejected', message: '今天已经提醒过该学员，明天再试' }] })
    const view = render(<RenewalsWorkspace api={api} token="token" />)
    await user.click(within(await screen.findByRole('table', { name: '待续费学员' })).getByRole('button', { name: '给张同学发送续费提醒' }))
    await user.click(within(screen.getByRole('dialog', { name: '发送续费提醒' })).getByRole('button', { name: '发送' }))
    expect(await screen.findByText('张同学：今天已经提醒过该学员，明天再试')).toBeInTheDocument()
    view.unmount()

    const failing = createMockOpsApi()
    vi.spyOn(failing, 'listRenewals').mockRejectedValueOnce(new Error('网络不可用'))
    render(<RenewalsWorkspace api={failing} token="token" />)
    expect(await screen.findByText('网络不可用')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByRole('table', { name: '待续费学员' })).toHaveTextContent('张同学')
  })
})
