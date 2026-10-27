import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { TeacherWorkloadWorkspace } from './TeacherWorkloadWorkspace'

describe('teacher workload workspace', () => {
  it('separates queues and lets Admin confirm a reviewed earning', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const confirm = vi.spyOn(api, 'confirmTeacherCredit')
    render(<TeacherWorkloadWorkspace api={api} token="token" />)

    expect((await screen.findAllByText('林老师')).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: '复核确认' })[0])
    const dialog = screen.getByRole('dialog', { name: '确认教师工作量' })
    expect(dialog).toHaveTextContent('合唱排练')
    expect(dialog).toHaveTextContent('1')
    await user.clear(within(dialog).getByLabelText('确认说明'))
    await user.type(within(dialog).getByLabelText('确认说明'), '教务复核无误')
    await user.click(within(dialog).getByRole('button', { name: '确认工作量' }))

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('token', 'teacher_event_1', '教务复核无误'))
    expect(await screen.findByText('还没有待确认教师工作量')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '已确认' }))
    expect((await screen.findAllByText('林老师')).length).toBeGreaterThan(0)
  })

  it('shows command and loading errors with retryable state', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'confirmTeacherCredit').mockRejectedValueOnce(new Error('确认失败'))
    const view = render(<TeacherWorkloadWorkspace api={api} token="token" />)
    await user.click((await screen.findAllByRole('button', { name: '复核确认' }))[0])
    await user.click(screen.getByRole('button', { name: '确认工作量' }))
    expect(await screen.findByText('确认失败')).toBeInTheDocument()
    view.unmount()

    const failingApi = createMockOpsApi()
    vi.spyOn(failingApi, 'listCourseResource').mockRejectedValueOnce('offline')
    render(<TeacherWorkloadWorkspace api={failingApi} token="token" />)
    expect(await screen.findByText('加载教师工作量失败')).toBeInTheDocument()
  })
})
