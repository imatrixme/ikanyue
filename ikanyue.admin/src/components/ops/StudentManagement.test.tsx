import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { createMockOpsApi } from '../../app/api'
import type { StudentRecord } from '../../app/types'
import { StudentsPanel } from './StudentsPanel'

const students: StudentRecord[] = [
  { id: 'active', realName: '张同学', nickName: '小张', cellphone: '13900139001', avatar: '', blocked: false, lastLoginAt: '2026-07-01T08:00:00.000Z', created: '2026-06-01T08:00:00.000Z', updated: '2026-07-01T08:00:00.000Z' },
  { id: 'inactive', realName: '李同学', nickName: '', cellphone: '13900139002', avatar: '', blocked: true, lastLoginAt: '', created: '2026-06-02T08:00:00.000Z', updated: '2026-06-02T08:00:00.000Z' },
]

describe('student management', () => {
  it('filters, sorts, resets, reloads, and distinguishes loading and empty states', async () => {
    const user = userEvent.setup()
    const onReload = vi.fn()
    const { rerender } = render(<StudentsPanel loading={false} onReload={onReload} onSave={vi.fn()} students={students} />)

    await user.selectOptions(screen.getByLabelText('状态'), 'inactive')
    expect(screen.getByRole('table')).toHaveTextContent('李同学')
    expect(screen.getByRole('table')).not.toHaveTextContent('张同学')
    await user.selectOptions(screen.getByLabelText('排序'), 'name-desc')
    await user.type(screen.getByLabelText('搜索学员'), '不存在')
    expect(screen.getByText('没有匹配的学员')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重置筛选' }))
    expect(screen.getByRole('table')).toHaveTextContent('张同学')
    await user.click(screen.getByRole('button', { name: '重新加载学员管理列表' }))
    expect(onReload).toHaveBeenCalled()

    rerender(<StudentsPanel loading onReload={onReload} onSave={vi.fn()} students={[]} />)
    expect(screen.getByText('正在加载学员...')).toBeInTheDocument()
    rerender(<StudentsPanel loading={false} onReload={onReload} onSave={vi.fn()} students={[]} />)
    expect(screen.getByText('还没有学员')).toBeInTheDocument()
    rerender(<StudentsPanel errorMessage="network down" loading={false} onReload={onReload} onSave={vi.fn()} students={[]} />)
    expect(screen.getByText('学员列表加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(onReload).toHaveBeenCalledTimes(2)
  })

  it('protects dirty create data and keeps a failed save open', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(false)
    render(<StudentsPanel loading={false} onReload={vi.fn()} onSave={onSave} students={students} />)
    await user.click(screen.getByRole('button', { name: '新增学员' }))
    expect(screen.getByRole('button', { name: '创建学员' })).toBeDisabled()
    await user.type(screen.getByLabelText('学员姓名'), '王同学')
    await user.type(screen.getByLabelText('手机号'), '13900139003')
    await user.type(screen.getByLabelText('初始密码'), 'secret123')
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    expect(screen.getByText('放弃未保存修改？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.getByLabelText('学员姓名')).toHaveValue('王同学')
    await user.click(screen.getByRole('button', { name: '创建学员' }))
    expect(onSave).toHaveBeenCalledWith(null, expect.objectContaining({ realName: '王同学', blocked: false }))
    expect(screen.getByRole('dialog', { name: '新增学员' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('edits status while preserving an empty password reset', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(true)
    render(<StudentsPanel loading={false} onReload={vi.fn()} onSave={onSave} students={students} />)
    await user.click(screen.getAllByRole('button', { name: '编辑张同学' })[0])
    const dialog = screen.getByRole('dialog', { name: '编辑张同学' })
    expect(within(dialog).getByLabelText('重置密码')).toHaveValue('')
    await user.selectOptions(within(dialog).getByLabelText('状态'), 'inactive')
    await user.click(screen.getByRole('button', { name: '保存学员' }))
    expect(onSave).toHaveBeenCalledWith('active', expect.objectContaining({ blocked: true, password: '' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('creates a learner in App and refreshes the points projection', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)
    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    await screen.findByRole('heading', { name: '学员积分' })
    await user.click(screen.getByRole('button', { name: '学员管理' }))
    await user.click(screen.getByRole('button', { name: '新增学员' }))
    await user.type(screen.getByLabelText('学员姓名'), '新增学员')
    await user.type(screen.getByLabelText('手机号'), '13900139999')
    await user.type(screen.getByLabelText('初始密码'), 'secret123')
    await user.click(screen.getByRole('button', { name: '创建学员' }))
    expect(await screen.findByText('学员已创建')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('新增学员')
    await user.click(screen.getByRole('button', { name: '学员积分' }))
    expect(screen.getByRole('table')).toHaveTextContent('新增学员')
  })

  it('restores sanitized preferences, paginates, and renders identity/date fallbacks', async () => {
    localStorage.setItem('kanyue.students.filters.v1', JSON.stringify({ keyword: 3, status: 'bad', sort: 'bad' }))
    const user = userEvent.setup()
    const many = Array.from({ length: 10 }, (_, index): StudentRecord => ({
      id: `student_${index}`,
      realName: index === 0 ? '' : `学员${index}`,
      nickName: index === 0 ? '' : `昵称${index}`,
      cellphone: index === 0 ? '' : `1390000000${index}`,
      avatar: '',
      blocked: index % 2 === 0,
      lastLoginAt: index === 0 ? 'bad-date' : '',
      created: `2026-06-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
      updated: '',
    }))
    const view = render(<StudentsPanel loading={false} onReload={vi.fn()} onSave={vi.fn()} students={many} />)
    expect(screen.getByLabelText('状态')).toHaveValue('all')
    expect(screen.getByLabelText('排序')).toHaveValue('created-desc')
    await user.selectOptions(screen.getByLabelText('排序'), 'created-asc')
    expect(screen.getByRole('table')).toHaveTextContent('未命名学员')
    expect(screen.getByRole('table')).toHaveTextContent('bad-date')
    await user.selectOptions(screen.getByLabelText('排序'), 'name-asc')
    await user.selectOptions(screen.getByLabelText('排序'), 'name-desc')
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByText(/第 2\/2 页/)).toBeInTheDocument()

    view.unmount()
    localStorage.setItem('kanyue.students.filters.v1', '[]')
    render(<StudentsPanel loading={false} onReload={vi.fn()} onSave={vi.fn()} students={many.slice(0, 1)} />)
    expect(screen.getByLabelText('排序')).toHaveValue('created-desc')
  })

  it('closes a clean editor and keeps an App edit failure open', async () => {
    const user = userEvent.setup()
    const first = render(<StudentsPanel loading={false} onReload={vi.fn()} onSave={vi.fn()} students={students} />)
    await user.click(screen.getAllByRole('button', { name: '编辑张同学' })[0])
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    first.unmount()

    const api = createMockOpsApi()
    api.updateStudent = vi.fn().mockRejectedValue(new Error('student update failed'))
    render(<App api={api} />)
    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    await screen.findByRole('heading', { name: '学员积分' })
    await user.click(screen.getByRole('button', { name: '学员管理' }))
    await user.click(screen.getAllByRole('button', { name: '编辑张同学' })[0])
    await user.type(screen.getByLabelText('昵称'), '改')
    await user.click(screen.getByRole('button', { name: '保存学员' }))
    expect(await screen.findByText('student update failed')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '编辑张同学' })).toBeInTheDocument()
  })

  it('opens legacy learners through nickname, cellphone, and unnamed fallbacks', async () => {
    const user = userEvent.setup()
    const legacy: StudentRecord[] = [
      { ...students[0], id: 'nick-only', realName: '', nickName: '只有昵称', cellphone: '' },
      { ...students[0], id: 'phone-only', realName: '', nickName: '', cellphone: '13900009999' },
      { ...students[0], id: 'unnamed', realName: '', nickName: '', cellphone: '' },
    ]
    render(<StudentsPanel loading={false} onReload={vi.fn()} onSave={vi.fn()} students={legacy} />)
    for (const name of ['只有昵称', '13900009999', '未命名学员']) {
      await user.click(screen.getAllByRole('button', { name: `编辑${name}` })[0])
      expect(screen.getByRole('dialog', { name: `编辑${name === '未命名学员' ? '学员' : name}` })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '取消' }))
    }
  })
})
