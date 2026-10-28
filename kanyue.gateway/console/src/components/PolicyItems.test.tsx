import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PolicyItem } from '../lib/gateway'
import { mockFetch } from '../test/fetch'
import { PolicyItems, type ItemsKind } from './PolicyItems'

const plugins = [
  { name: 'rate-limit', priority: 900, schema: { type: 'object', properties: { limit: { type: 'integer' } } } },
  { name: 'jwt-auth', priority: 1000, schema: { type: 'object', properties: {} } },
]

function Harness({ kind, initial, onChange, id }: { kind: ItemsKind; initial: PolicyItem[]; onChange: (value: PolicyItem[]) => void; id?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <PolicyItems
      impact={{ collection: 'policy_sets', id, field: 'items' }}
      kind={kind}
      onChange={(next) => { setValue(next); onChange(next) }}
      value={value}
    />
  )
}

describe('PolicyItems', () => {
  it('adds, locks and limits an item to environments', async () => {
    mockFetch({ 'GET /gateway/v1/plugins': { body: plugins } })
    const onChange = vi.fn()
    render(<Harness initial={[]} kind="set" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '添加策略' }))
    await userEvent.selectOptions(await screen.findByLabelText('插件'), 'rate-limit')
    await userEvent.click(screen.getByRole('checkbox', { name: '锁定（下层不可改）' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '生产' }))
    expect(onChange).toHaveBeenLastCalledWith([{ plugin: 'rate-limit', config: {}, locked: true, stages: ['RELEASE'] }])
    // Without a stored record there is nothing to preview against.
    expect(screen.queryByRole('button', { name: '预览影响' })).toBeNull()
  })

  it('offers no authentication plugins or locks to applications', async () => {
    mockFetch({ 'GET /gateway/v1/plugins': { body: plugins } })
    render(<Harness initial={[{ plugin: '' }]} kind="application" onChange={vi.fn()} />)
    const select = await screen.findByLabelText('插件')
    await screen.findByRole('option', { name: /rate-limit/ })
    expect(select).not.toHaveTextContent('jwt-auth')
    expect(screen.queryByRole('checkbox', { name: /锁定/ })).toBeNull()
  })

  it('previews the impact of the unsaved items', async () => {
    const calls = mockFetch({
      'GET /gateway/v1/plugins': { body: plugins },
      'POST /gateway/v1/impact': { body: [{ api: 'get-x', id: 'a1', group: 'mapi', stage: 'RELEASE', error: 'override cannot change rate-limit: it is locked' }] },
    })
    render(<Harness id="set1" initial={[{ plugin: 'rate-limit', config: { limit: 5 }, locked: true }]} kind="set" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '预览影响' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('mapi/get-x @生产：override cannot change rate-limit')
    const impact = calls.find((call) => call.url === '/gateway/v1/impact')
    expect(impact?.body).toEqual({ collection: 'policy_sets', id: 'set1', fields: { items: [{ plugin: 'rate-limit', config: { limit: 5 }, locked: true }] } })
  })
})
