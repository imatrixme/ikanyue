import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox, FormMessage, IconButton, SegmentedControl, Switch, Textarea } from './Controls'
import { AsyncState, EmptyState, Tabs } from './DataDisplay'
import { ConfirmDialog } from './ConfirmDialog'
import { DrawerShell } from './DrawerShell'

describe('admin shared primitives', () => {
  it('exposes stable command, segmented, and form control semantics', async () => {
    const user = userEvent.setup()
    const onCommand = vi.fn()
    const onModeChange = vi.fn()
    const onSwitch = vi.fn()
    render(
      <div>
        <IconButton icon={<span>+</span>} label="新增记录" onClick={onCommand} />
        <SegmentedControl label="模式" onChange={onModeChange} options={[{ label: '列表', value: 'list' }, { label: '时间线', value: 'timeline' }]} value="list" />
        <Checkbox description="保留审计信息" label="记录操作" />
        <Switch checked={false} description="立即对学员可见" label="启用" onChange={onSwitch} />
        <Textarea aria-label="说明" defaultValue="内容" />
        <FormMessage tone="error">字段有误</FormMessage>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: '新增记录' }))
    await user.click(screen.getByRole('button', { name: '切换到时间线' }))
    await user.click(screen.getByRole('switch', { name: /启用/ }))
    expect(onCommand).toHaveBeenCalledOnce()
    expect(onModeChange).toHaveBeenCalledWith('timeline')
    expect(onSwitch).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('说明')).toHaveValue('内容')
    expect(screen.getByText('字段有误')).toBeInTheDocument()
  })

  it('renders loading, error, empty, content, tabs, and retry states', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<AsyncState loading loadingLabel="加载中"><p>内容</p></AsyncState>)
    expect(screen.getByText('加载中')).toBeInTheDocument()

    rerender(<AsyncState error="网络不可用" errorTitle="读取失败" loading={false} loadingLabel="加载中" onRetry={onRetry}><p>内容</p></AsyncState>)
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.getByText('读取失败')).toBeInTheDocument()

    rerender(<AsyncState empty={<EmptyState noun="记录" />} loading={false} loadingLabel="加载中"><p>内容</p></AsyncState>)
    expect(screen.getByText('还没有记录')).toBeInTheDocument()

    const onTabChange = vi.fn()
    rerender(<><Tabs label="详情页签" onChange={onTabChange} options={[{ label: '概览', value: 'summary' }, { label: '流水', value: 'events' }]} value="summary" /><AsyncState loading={false} loadingLabel="加载中"><p>内容</p></AsyncState></>)
    await user.click(screen.getByRole('tab', { name: '流水' }))
    expect(onTabChange).toHaveBeenCalledWith('events')
    expect(screen.getByText('内容')).toBeInTheDocument()
  })

  it('traps drawer focus, closes on Escape, and restores the opener', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [open, setOpen] = useState(false)
      return <><button onClick={() => setOpen(true)}>打开详情</button>{open ? <DrawerShell onRequestClose={() => setOpen(false)} title="学员详情"><button data-autofocus>抽屉操作</button></DrawerShell> : null}</>
    }

    render(<Harness />)
    const opener = screen.getByRole('button', { name: '打开详情' })
    await user.click(opener)
    await waitFor(() => expect(screen.getByRole('button', { name: '抽屉操作' })).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '学员详情' })).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('supports an explicit destructive confirmation', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmDialog confirmLabel="放弃修改" description="关闭后无法恢复。" destructive onCancel={onCancel} onConfirm={onConfirm} title="确认放弃？" />)
    await user.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
