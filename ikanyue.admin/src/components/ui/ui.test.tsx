import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { resourceConfig } from '../../app/resourceConfig'
import { Badge } from './Badge'
import { Button } from './Button'
import { Panel, SectionHeader } from './Card'
import { DataTable } from './DataTable'
import { Field, Input, Label } from './Input'
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
    expect(screen.getByText('active')).toBeInTheDocument()

    rerender(<DataTable columns={resourceConfig.activities.columns} rows={[]} emptyLabel="没有记录" />)
    expect(screen.getByText('没有记录')).toBeInTheDocument()
    expect(statusTone('inactive')).toBe('red')
    expect(statusTone('unknown')).toBe('neutral')
  })

  it('merges tailwind utility classes predictably', () => {
    const isHidden = false
    expect(cn('px-2', 'px-4', isHidden && 'hidden')).toContain('px-4')
  })
})
