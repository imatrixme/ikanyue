import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '../ui/Button'
import { DialogShell } from '../ui/DialogShell'
import type { StudentPointsRow } from '../../app/types'
import { pageItems, parseOptionalNumber, readPersistedFilters } from './listState'
import { PointsWorkspace } from './PointsWorkspace'

describe('admin workflow infrastructure', () => {
  it('traps focus, closes on Escape, and restores the opener', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    const opener = screen.getByRole('button', { name: '打开测试弹窗' })
    await user.click(opener)
    const first = screen.getByRole('button', { name: '第一个操作' })
    const last = screen.getByRole('button', { name: '最后一个操作' })
    expect(first).toHaveFocus()
    last.focus()
    await user.tab()
    expect(screen.getByRole('button', { name: '关闭弹窗' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('wraps reverse focus and can be made non-dismissible', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogShell dismissible={false} onRequestClose={onClose} title="固定弹窗"><Button data-autofocus>唯一操作</Button></DialogShell>)
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '唯一操作' })).toHaveFocus()
  })

  it('sanitizes persisted state and paginates bounded pages', () => {
    localStorage.setItem('bad', '{broken')
    expect(readPersistedFilters('bad', { value: 'default' }, () => ({ value: 'stored' }))).toEqual({ value: 'default' })
    localStorage.setItem('good', JSON.stringify({ value: 'saved' }))
    expect(readPersistedFilters('good', { value: 'default' }, (value) => value as { value: string })).toEqual({ value: 'saved' })
    expect(pageItems([1, 2, 3, 4, 5], 9, 2)).toEqual({ items: [5], page: 3, totalPages: 3 })
    expect(pageItems([], 0, 8)).toEqual({ items: [], page: 1, totalPages: 1 })
    expect(parseOptionalNumber('')).toBeNull()
    expect(parseOptionalNumber('bad')).toBeNull()
    expect(parseOptionalNumber('12')).toBe(12)
  })

  it('paginates learner rows and restores persisted sorting', async () => {
    localStorage.setItem('kanyue.points.filters.v1', JSON.stringify({ keyword: '', minBalance: '', maxBalance: '', sort: 'balance-desc' }))
    const user = userEvent.setup()
    render(<PointsWorkspace loading={false} rewards={[]} selectedStudentId="" studentSummary={null} students={makeStudents(10)} onAddPoints={vi.fn()} onLoadStudent={vi.fn()} onRedeem={vi.fn()} onReloadStudents={vi.fn()} />)
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('学员09')
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByRole('table')).toHaveTextContent('学员01')
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })
})

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return <><Button onClick={() => setOpen(true)}>打开测试弹窗</Button>{open ? <DialogShell onRequestClose={() => setOpen(false)} title="测试弹窗"><div className="grid gap-2 p-4"><Button data-autofocus>第一个操作</Button><Button>最后一个操作</Button></div></DialogShell> : null}</>
}

function makeStudents(count: number): StudentPointsRow[] { return Array.from({ length: count }, (_, index) => ({ id: `student_${index}`, realName: `学员${String(index).padStart(2, '0')}`, nickName: '', cellphone: `1390000${String(index).padStart(4, '0')}`, balance: index * 10 })) }
