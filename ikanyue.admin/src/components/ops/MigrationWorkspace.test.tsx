import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import type { MigrationInventory } from '../../app/migrationTypes'
import { MigrationWorkspace } from './MigrationWorkspace'

describe('historical migration workspace', () => {
  it('requires an explicit mapping, zero-difference preview, and human confirmation', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    api.getMigrationInventory = vi.fn().mockResolvedValue(inventory())
    api.previewMigration = vi.fn(async (_token, plan) => ({
      plan, previewHash: 'hash', ready: true,
      report: { differences: [], mapped: { studentHours: 4 }, source: inventory().totals, unmapped: { attendance: [], programs: [], sessions: [], studentHours: [], teacherHours: [] } },
    }))
    api.applyMigration = vi.fn().mockResolvedValue({ counts: { programs: 0, sessions: 0, studentMappings: 1, teacherAdjustments: 0 }, differenceCount: 0, operationId: 'migration-operation', previewHash: 'hash', replayed: false, unexplainedCount: 0 })
    render(<MigrationWorkspace api={api} token="token" />)

    expect(await screen.findByRole('heading', { name: '学员旧课时映射' })).toBeInTheDocument()
    const previewButton = screen.getByRole('button', { name: '生成零差异预览' })
    expect(previewButton).toBeDisabled()
    await user.selectOptions(screen.getAllByLabelText('学员甲目标课程点')[0], 'credit_voice')
    expect(previewButton).toBeEnabled()
    await user.click(previewButton)
    expect(await screen.findByText('预览通过：零未解释差异')).toBeInTheDocument()
    const applyButton = screen.getByRole('button', { name: '提交迁移' })
    expect(applyButton).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /我已核对本次迁移/ }))
    await user.click(applyButton)
    expect(await screen.findByText(/migration-operation/)).toBeInTheDocument()
    expect(api.applyMigration).toHaveBeenCalledWith('token', expect.any(Object), 'hash')
  })

  it('shows empty inventory and retries an initial inventory failure', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    api.getMigrationInventory = vi.fn().mockRejectedValueOnce(new Error('盘点接口失败')).mockResolvedValueOnce({ ...inventory(), studentHours: [], totals: { ...inventory().totals, studentHours: 0, students: 0 } })
    render(<MigrationWorkspace api={api} token="token" />)

    expect(await screen.findByText('盘点接口失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByText('还没有需要迁移的历史课程数据')).toBeInTheDocument()
    await waitFor(() => expect(api.getMigrationInventory).toHaveBeenCalledTimes(2))
  })
})

function inventory(): MigrationInventory {
  return {
    availability: { students: true }, attendance: [], programs: [], sessions: [],
    studentHours: [{ id: 'student_1', label: '学员甲', hours: 4 }], teacherHours: [],
    targets: { classes: [], packages: [], creditTypes: [{ id: 'credit_voice', code: 'VOICE', name: '声乐课时', status: 'active' }] },
    totals: { attendance: 0, programs: 0, sessions: 0, studentHours: 4, students: 1, teacherHours: 0, teachers: 0 },
  }
}
