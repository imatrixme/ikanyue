import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { mockResources } from '../../app/mockData'
import { resourceConfig } from '../../app/resourceConfig'
import type { OpsResource } from '../../app/types'
import { Badge } from './Badge'
import { Button } from './Button'
import { Panel, SectionHeader } from './Card'
import { Combobox } from './Combobox'
import { DataTable } from './DataTable'
import { DateTimePicker } from './DateTimePicker'
import { EntityPicker } from './EntityPicker'
import { FilePicker } from './FilePicker'
import { FloatingTooltip } from './FloatingTooltip'
import { Field, Input, Label } from './Input'
import { LocationPicker } from './LocationPicker'
import { PageHeader } from './PageHeader'
import { RichTextEditor } from './RichTextEditor'
import { SettingLine, SettingsPanel } from './SettingsPanel'
import { Sheet } from './Sheet'
import { statusTone } from './status'
import { cn } from './utils'

describe('ui primitives', () => {
  it('renders buttons, badges, inputs, and panels with accessible text', () => {
    render(
      <Panel>
        <SectionHeader>
          <Badge tone="green">可用</Badge>
          <Button variant="secondary">保存</Button>
        </SectionHeader>
        <Field label="标题" htmlFor="title" hint="必填">
          <Input id="title" defaultValue="公开课" />
        </Field>
        <Label>状态</Label>
      </Panel>,
    )

    expect(screen.getByText('可用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('公开课')).toBeInTheDocument()
    expect(screen.getByText('必填')).toBeInTheDocument()
  })

  it('renders table rows, empty state, and status tones', () => {
    const { rerender } = render(
      <DataTable columns={resourceConfig.activities.columns} rows={[{ id: 'a1', title: '公开课', type: 'open', location: '上海', status: 'active' }]} />,
    )
    expect(screen.getAllByText('公开课').length).toBeGreaterThan(0)
    expect(screen.getAllByText('上架').length).toBeGreaterThan(0)

    rerender(<DataTable columns={resourceConfig.activities.columns} rows={[]} emptyLabel="没有记录" />)
    expect(screen.getAllByText('没有记录').length).toBeGreaterThan(0)
    expect(statusTone('inactive')).toBe('red')
    expect(statusTone('unknown')).toBe('neutral')

    rerender(<DataTable columns={resourceConfig.activities.columns} rows={[{ id: 'a2', title: null, type: 'open', location: '上海', status: null }]} />)
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2)
  })

  it('supports TanStack table filtering, sorting affordances, selection, and density', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        columns={resourceConfig.activities.columns}
        rows={[
          { id: 'a1', title: '周末公开课', type: 'open-class', location: '上海', status: 'active' },
          { id: 'a2', title: '暑期体验营', type: 'trial', location: '杭州', status: 'draft' },
        ]}
      />,
    )

    await user.type(screen.getByLabelText('当前页快速筛选'), '暑期')
    expect(screen.getAllByText('暑期体验营').length).toBeGreaterThan(0)
    expect(screen.queryByText('周末公开课')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('选择当前页全部记录'))
    expect(screen.getByText('已选 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '紧凑' }))
    expect(screen.getByRole('button', { name: '舒展' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /活动/ }))
    await user.click(screen.getByRole('button', { name: /活动/ }))
    expect(screen.getByText('显示 1 / 2')).toBeInTheDocument()

    render(<DataTable columns={[{ key: 'avatar', label: '头像' }]} rows={[{ id: 'avatar_1', avatar: 'avatars/raw-key' }]} />)
    expect(screen.getAllByText('raw-key').length).toBeGreaterThan(0)
  })

  it('renders semantic cells across resource tables', () => {
    Object.entries(resourceConfig).forEach(([resource, config]) => {
      const rows = mockResources[resource as OpsResource]?.items || []
      const table = render(<DataTable columns={config.columns} rows={rows.slice(0, 1)} />)
      table.unmount()
    })

    render(<DataTable columns={resourceConfig.reportInstances.columns} rows={mockResources.reportInstances.items.slice(0, 1)} />)
    expect(screen.getAllByText('学生测评').length).toBeGreaterThan(0)
    expect(screen.getAllByText('学员').length).toBeGreaterThan(0)
  })

  it('records picked file names from file controls', async () => {
    const user = userEvent.setup()
    const values: Array<string | File> = []
    const file = new File(['audio'], 'warmup.mp3', { type: 'audio/mpeg' })
    render(<ControlledFilePicker values={values} />)

    await user.upload(screen.getByLabelText('选择音频文件'), file)
    expect(values).toContain(file)

    expect(screen.getByText('浏览器端暂存，保存时随表单提交')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清除文件' }))
    expect(values).toContain('')
  })

  it('previews image files and existing image urls', async () => {
    const user = userEvent.setup()
    const values: Array<string | File> = []
    const createObjectURL = vi.fn(() => 'blob:cover-preview')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const image = new File(['image'], 'cover.png', { type: 'image/png' })
    const { rerender, unmount } = render(<ControlledFilePicker label="封面" values={values} accept="image/*" />)

    await user.upload(screen.getByLabelText('选择封面'), image)
    expect(screen.getByAltText('封面预览')).toHaveAttribute('src', 'blob:cover-preview')
    expect(screen.getByText('cover.png')).toBeInTheDocument()

    rerender(<FilePicker label="封面" value="https://kyoss.abcmem.com/covers/summer.webp?x=1" onValueChange={(value) => values.push(value)} />)
    expect(screen.getByAltText('封面预览')).toHaveAttribute('src', 'https://kyoss.abcmem.com/covers/summer.webp?x=1')
    expect(screen.getByText('已有文件')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清除文件' }))
    expect(values).toContain('')

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-preview')
    vi.unstubAllGlobals()
  })

  it('edits rich text in markdown/html modes and uploads images through callback', async () => {
    const user = userEvent.setup()
    const updates: string[] = []
    const uploads: File[] = []
    const image = new File(['image'], 'cover.png', { type: 'image/png' })
    render(
      <RichTextEditor
        label="活动简介"
        value="<p>初始</p>"
        onChange={(value) => updates.push(value)}
        onUploadImage={async (file) => {
          uploads.push(file)
          return `https://kyoss.abcmem.com/rich/${file.name}`
        }}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    await user.clear(screen.getByLabelText('活动简介 Markdown源码'))
    await user.type(screen.getByLabelText('活动简介 Markdown源码'), '## 标题')
    expect(updates.at(-1)).toContain('<h2>标题</h2>')

    await user.click(screen.getByRole('tab', { name: 'HTML' }))
    await user.clear(screen.getByLabelText('活动简介 HTML源码'))
    await user.type(screen.getByLabelText('活动简介 HTML源码'), '<p>HTML正文</p>')
    expect(updates.at(-1)).toBe('<p>HTML正文</p>')

    await user.upload(screen.getByLabelText('活动简介上传图片'), image)
    expect(uploads).toEqual([image])
    expect(updates.at(-1)).toContain('https://kyoss.abcmem.com/rich/cover.png')
  })

  it('uses rich text visual toolbar, link editing, and upload fallbacks', async () => {
    const user = userEvent.setup()
    const updates: string[] = []
    const image = new File(['image'], 'local.png', { type: 'image/png' })
    const { unmount } = render(<RichTextEditor label="正文" value="<p>初始</p>" onChange={(value) => updates.push(value)} />)

    await waitFor(() => expect(screen.getByLabelText('正文')).toHaveAttribute('contenteditable', 'true'))
    await user.click(screen.getByLabelText('正文'))
    for (const name of ['正文二级标题', '正文加粗', '正文斜体', '正文删除线', '正文无序列表', '正文有序列表', '正文引用', '正文代码']) {
      await user.click(screen.getByRole('button', { name }))
    }

    await user.click(screen.getByRole('button', { name: '正文链接' }))
    await user.type(screen.getByRole('textbox', { name: '正文链接' }), 'https://ikanyue.com')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '正文链接' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '正文链接' }))
    await user.click(screen.getByRole('button', { name: '应用' }))
    await user.upload(screen.getByLabelText('正文上传图片'), image)
    expect(await screen.findByText('未配置富文本图片上传接口')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    expect(screen.getByRole('button', { name: '正文加粗' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: '编辑' }))
    await waitFor(() => expect(screen.getByLabelText('正文')).toHaveAttribute('contenteditable', 'true'))
    expect(updates.length).toBeGreaterThan(0)

    unmount()
    render(
      <RichTextEditor
        label="正文"
        value="<p>初始</p>"
        onChange={() => undefined}
        onUploadImage={async () => {
          throw new Error('对象存储失败')
        }}
      />,
    )
    await user.upload(screen.getByLabelText('正文上传图片'), image)
    expect(await screen.findByText('对象存储失败')).toBeInTheDocument()
  })

  it('covers optional rendering branches for shared layout primitives', async () => {
    const user = userEvent.setup()
    const closes: string[] = []
    const { rerender } = render(
      <Sheet open={false} title="隐藏表单" onClose={() => closes.push('closed')}>
        <div>隐藏内容</div>
      </Sheet>,
    )
    expect(screen.queryByText('隐藏内容')).not.toBeInTheDocument()

    rerender(
      <Sheet open title="无描述表单" onClose={() => closes.push('closed')}>
        <div>表单内容</div>
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: '无描述表单' })).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭表单遮罩' }))
    expect(closes).toEqual(['closed'])

    rerender(<PageHeader title="纯标题" />)
    expect(screen.getByText('纯标题')).toBeInTheDocument()
    expect(screen.queryByText('Guided operations')).not.toBeInTheDocument()

    rerender(
      <SettingsPanel title="基础设置" description="没有状态徽标" icon={<span>图标</span>}>
        <SettingLine label="键" value="值" />
        <SettingLine label="弱化键" value="弱化值" hint="说明文字" muted />
      </SettingsPanel>,
    )
    expect(screen.getByText('没有状态徽标')).toBeInTheDocument()
    expect(screen.getByText('说明文字')).toBeInTheDocument()
  })

  it('traps sheet focus, restores focus, and supports escape without stealing typing focus', async () => {
    const user = userEvent.setup()
    const closes: string[] = []
    const first = render(
      <div>
        <button type="button">打开前焦点</button>
        <Sheet
          open
          title="键盘表单"
          description="可用键盘关闭"
          onClose={() => closes.push('closed')}
          footer={<button type="button">底部动作</button>}
        >
          <label>
            名称
            <input aria-label="名称" defaultValue="" />
          </label>
          <button type="button">正文动作</button>
        </Sheet>
      </div>,
    )

    const input = screen.getByLabelText('名称')
    input.focus()
    await user.type(input, '完整输入')
    expect(input).toHaveValue('完整输入')
    screen.getByRole('button', { name: '底部动作' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '底部动作' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(closes).toEqual(['closed'])
    first.unmount()

    const { rerender } = render(
      <Sheet open title="暂停表单" suspended onClose={() => closes.push('suspended')}>
        <button type="button">不会聚焦</button>
      </Sheet>,
    )
    expect(screen.queryByRole('dialog', { name: '暂停表单' })).not.toBeInTheDocument()
    rerender(<Sheet open={false} title="关闭表单" onClose={() => undefined}><div>关闭</div></Sheet>)
    expect(screen.queryByText('关闭')).not.toBeInTheDocument()
  })

  it('merges tailwind utility classes predictably', () => {
    const isHidden = false
    expect(cn('px-2', 'px-4', isHidden && 'hidden')).toContain('px-4')
  })

  it('filters combobox options and reports unmatched values', async () => {
    const user = userEvent.setup()
    const values: string[] = []
    const { rerender } = render(
      <Combobox
        aria-label="选择项目"
        value=""
        options={[{ value: 'program_1', label: '春季体验课' }, { value: 'program_2', label: '暑期声乐包' }]}
        onValueChange={(value) => values.push(value)}
      />,
    )

    await user.type(screen.getByLabelText('选择项目'), '暑期')
    expect(screen.queryByText('春季体验课')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '暑期声乐包' }))
    expect(values).toEqual(['program_2'])

    rerender(<Combobox aria-label="选择项目" value="missing" options={[]} onValueChange={(value) => values.push(value)} />)
    expect(screen.getByText('当前 ID 未在已加载数据中匹配：missing')).toBeInTheDocument()
    expect(screen.getByText('暂无可选数据')).toBeInTheDocument()
  })

  it('updates date-time picker time and opens the calendar', async () => {
    const user = userEvent.setup()
    const values: string[] = []
    render(<ControlledDateTimePicker values={values} />)

    fireEvent.change(screen.getByLabelText('开始时间时间'), { target: { value: '10:15' } })
    expect(values.at(-1)).toContain('10:15')
    await user.click(screen.getByRole('button', { name: '开始时间' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('handles empty and invalid date-time values', () => {
    const values: string[] = []
    const { rerender } = render(<DateTimePicker label="结束时间" value="" onChange={(value) => values.push(value)} />)

    expect(screen.getByRole('button', { name: '结束时间' })).toHaveTextContent('选择日期和时间')
    fireEvent.change(screen.getByLabelText('结束时间时间'), { target: { value: '07:45' } })
    expect(values.at(-1)).toContain('T07:45')

    rerender(<DateTimePicker label="结束时间" value="not-a-date" onChange={(value) => values.push(value)} />)
    expect(screen.getByRole('button', { name: '结束时间' })).toHaveTextContent('选择日期和时间')
    fireEvent.change(screen.getByLabelText('结束时间时间'), { target: { value: '12:00' } })
    expect(values.at(-1)).toContain('T12:00')

    rerender(<DateTimePicker label="结束时间" value="2026-06-05T08:30:00.000Z" onChange={(value) => values.push(value)} />)
    expect(screen.getByRole('button', { name: '结束时间' })).toHaveTextContent('2026-06-05')
    fireEvent.change(screen.getByLabelText('结束时间时间'), { target: { value: '' } })
    expect(values.at(-1)).toContain('T00:00')
  })

  it('selects entities from searchable rosters and exposes selected details', async () => {
    const user = userEvent.setup()
    const values: Array<string | string[]> = []
    const lookup = {
      ...mockResources,
      students: {
        ...mockResources.students,
        items: [
          { ...mockResources.students.items[0], avatar: 'https://kyoss.abcmem.com/avatar/student.png' },
          ...mockResources.students.items.slice(1),
        ],
      },
    }
    const { rerender } = render(
      <EntityPicker
        label="学员"
        lookup={lookup}
        multiple
        resources={['students']}
        value={['student_1', 'student_2']}
        onValueChange={(value) => values.push(value)}
      />,
    )

    expect(screen.getAllByText('张同学 · 小张').length).toBeGreaterThan(0)
    const selectedChip = screen.getAllByText('张同学 · 小张')[0].closest('[tabindex="0"]') as HTMLElement
    fireEvent.focus(selectedChip)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('手机号')
    fireEvent.blur(selectedChip)

    await user.click(screen.getByRole('button', { name: '移除张同学 · 小张' }))
    expect(values.at(-1)).toEqual(['student_2'])

    await user.clear(screen.getByLabelText('学员'))
    await user.type(screen.getByLabelText('学员'), 'Echo')
    expect(screen.getByText('禁用')).toBeInTheDocument()
    await user.click(screen.getByLabelText('陈同学 · Echo'))
    expect(values.at(-1)).toEqual(['student_1', 'student_2', 'student_3'])

    await user.clear(screen.getByLabelText('学员'))
    await user.type(screen.getByLabelText('学员'), '不存在')
    expect(screen.getByText('没有匹配项')).toBeInTheDocument()

    rerender(
      <EntityPicker
        label="学员"
        lookup={lookup}
        resources={['students']}
        value="missing"
        onValueChange={(value) => values.push(value)}
      />,
    )
    expect(screen.getByText('当前 ID 未在已加载数据中匹配：missing')).toBeInTheDocument()
  })

  it('supports searchable location suggestions and free-text locations', async () => {
    const user = userEvent.setup()
    const values: string[] = []
    const { rerender } = render(<LocationPicker label="地点" value="" resources={mockResources} onValueChange={(value) => values.push(value)} />)

    await user.click(screen.getByLabelText('地点'))
    expect(screen.getByRole('button', { name: '上海静安' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '杭州西湖' }))
    expect(values).toContain('杭州西湖')

    rerender(<LocationPicker label="地点" value="上海" resources={mockResources} onValueChange={(value) => values.push(value)} />)
    await user.click(screen.getByLabelText('地点'))
    expect(screen.getByRole('button', { name: '上海静安' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '杭州西湖' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('地点'), { target: { value: '临时教室' } })
    expect(values.at(-1)).toBe('临时教室')

    rerender(
      <LocationPicker
        label="地点"
        value=""
        resources={{
          learningSessions: {
            items: [{ id: 'session_location', metadata: { location: '线上教室' } }],
            pagination: { page: 1, perPage: 20, totalItems: 1, totalPages: 1 },
          },
        }}
        onValueChange={(value) => values.push(value)}
      />,
    )
    await user.click(screen.getByLabelText('地点'))
    expect(screen.getByRole('button', { name: '线上教室' })).toBeInTheDocument()
  })

  it('renders floating tooltip portals only when open and positioned', async () => {
    const { rerender } = render(<TooltipHarness open={false} />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    rerender(<TooltipHarness open />)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('浮层详情')

    rerender(<TooltipHarness open={false} />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

function ControlledFilePicker({ values, label = '音频文件', accept = 'audio/*' }: { values: Array<string | File>; label?: string; accept?: string }) {
  const [value, setValue] = useState<string | File>('')
  return (
    <FilePicker
      label={label}
      value={value}
      accept={accept}
      onValueChange={(nextValue) => {
        values.push(nextValue)
        setValue(nextValue)
      }}
    />
  )
}

function ControlledDateTimePicker({ values }: { values: string[] }) {
  const [value, setValue] = useState('2026-06-05T08:30')
  return (
    <DateTimePicker
      label="开始时间"
      value={value}
      onChange={(nextValue) => {
        values.push(nextValue)
        setValue(nextValue)
      }}
    />
  )
}

function TooltipHarness({ open }: { open: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button ref={ref} type="button">锚点</button>
      <FloatingTooltip anchorRef={ref} open={open} width={240}>
        浮层详情
      </FloatingTooltip>
    </div>
  )
}
