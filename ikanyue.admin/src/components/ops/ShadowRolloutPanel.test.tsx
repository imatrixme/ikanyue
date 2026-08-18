import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { ShadowRolloutPanel } from './ShadowRolloutPanel'

describe('shadow rollout panel', () => {
  it('requires session selection, generated expectations, and academic confirmation', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    api.listCourseResource = vi.fn().mockResolvedValue({ page: 1, perPage: 100, totalItems: 2, totalPages: 1, items: [
      { id: 'completed', title: '已结束课堂', status: 'completed', startAt: '2026-08-18T01:00:00Z' },
      { id: 'scheduled', title: '未来课堂', status: 'scheduled' },
    ] })
    api.previewSettlement = vi.fn().mockResolvedValue({ sessionId: 'completed', canSettle: true, students: [{ sessionStudentId: 'student-row', action: 'consume' }], teachers: [{ sessionTeacherId: 'teacher-row', action: 'earn', quantity: 1 }] })
    api.runCourseCreditShadow = vi.fn().mockResolvedValue({ differenceCount: 0, generatedAt: '2026-08-18T08:00:00Z', reports: [], sessionCount: 1, status: 'passed', writeCount: 0 })
    render(<ShadowRolloutPanel api={api} token="token" />)

    expect(await screen.findByText(/已结束课堂/)).toBeInTheDocument()
    expect(screen.queryByText(/未来课堂/)).not.toBeInTheDocument()
    const runButton = screen.getByRole('button', { name: '运行只读影子核对' })
    expect(runButton).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /已结束课堂/ }))
    await user.click(screen.getByRole('button', { name: '生成教务核对模板' }))
    expect(await screen.findByDisplayValue(/student-row/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /教务预期已人工确认/ }))
    await user.click(runButton)
    expect(await screen.findByText('影子核对通过')).toBeInTheDocument()
    expect(screen.getByText(/0 个差异 · 0 次写入/)).toBeInTheDocument()
  })

  it('surfaces invalid expectation JSON and lesson loading failures', async () => {
    const api = createMockOpsApi()
    api.listCourseResource = vi.fn().mockRejectedValue(new Error('课堂接口失败'))
    render(<ShadowRolloutPanel api={api} token="token" />)
    expect(await screen.findByText('课堂接口失败')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('教务预期 JSON'), { target: { value: '{' } })
    expect(screen.getByText('教务预期 JSON 格式无效。')).toBeInTheDocument()
  })
})
