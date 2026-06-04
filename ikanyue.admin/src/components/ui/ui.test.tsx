import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { mockResources } from '../../app/mockData'
import { resourceConfig } from '../../app/resourceConfig'
import type { OpsResource } from '../../app/types'
import { Badge } from './Badge'
import { Button } from './Button'
import { Panel, SectionHeader } from './Card'
import { DataTable } from './DataTable'
import { FilePicker } from './FilePicker'
import { Field, Input, Label } from './Input'
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
    expect(screen.getByText('公开课')).toBeInTheDocument()
    expect(screen.getByText('上架')).toBeInTheDocument()

    rerender(<DataTable columns={resourceConfig.activities.columns} rows={[]} emptyLabel="没有记录" />)
    expect(screen.getByText('没有记录')).toBeInTheDocument()
    expect(statusTone('inactive')).toBe('red')
    expect(statusTone('unknown')).toBe('neutral')

    rerender(<DataTable columns={resourceConfig.activities.columns} rows={[{ id: 'a2', title: null, type: 'open', location: '上海', status: null }]} />)
    expect(screen.getAllByText('-')).toHaveLength(2)
  })

  it('renders semantic cells across resource tables', () => {
    Object.entries(resourceConfig).forEach(([resource, config]) => {
      const rows = mockResources[resource as OpsResource]?.items || []
      const table = render(<DataTable columns={config.columns} rows={rows.slice(0, 1)} />)
      table.unmount()
    })

    render(<DataTable columns={resourceConfig.reportInstances.columns} rows={mockResources.reportInstances.items.slice(0, 1)} />)
    expect(screen.getByText('学生测评')).toBeInTheDocument()
    expect(screen.getByText('学员')).toBeInTheDocument()
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

  it('merges tailwind utility classes predictably', () => {
    const isHidden = false
    expect(cn('px-2', 'px-4', isHidden && 'hidden')).toContain('px-4')
  })
})

function ControlledFilePicker({ values }: { values: Array<string | File> }) {
  const [value, setValue] = useState<string | File>('')
  return (
    <FilePicker
      label="音频文件"
      value={value}
      accept="audio/*"
      onValueChange={(nextValue) => {
        values.push(nextValue)
        setValue(nextValue)
      }}
    />
  )
}
