import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { mockFetch, type Call } from '../test/fetch'
import { ReleasePage } from './ReleasePage'

const records = (items: unknown[]) => ({ body: { items } })

function serve(release: (call: Call) => { status?: number; body: unknown }) {
  return mockFetch({
    'GET /api/collections/api_groups/records': records([{ id: 'g1', name: 'mapi' }]),
    'GET /api/collections/apis/records': records([{ id: 'a1', name: 'get-x', group: 'g1' }, { id: 'a2', name: 'post-x', group: 'g1' }]),
    'GET /api/collections/releases/records': records([]),
    'GET /gateway/v1/states': {
      body: { 'api:a1': { PRE: { version: 1, status: 'current' }, RELEASE: { version: 0, status: 'unreleased' } }, 'group:g1': { RELEASE: { version: 1, status: 'current' } } },
    },
    'POST /gateway/v1/release': release,
  })
}

const page = (url: string) => render(<MemoryRouter initialEntries={[url]}><ReleasePage /></MemoryRouter>)

describe('ReleasePage', () => {
  it('releases the targets ticked by the link to one environment', async () => {
    const calls = serve(() => ({ body: { stage: 'TEST', version: 2, released: [{ kind: 'api', id: 'a1', name: 'get-x', version: 2, previous: 1 }] } }))
    page('/release?select=api:a1')
    expect(await screen.findByRole('checkbox', { name: '选择 get-x' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 post-x' })).not.toBeChecked()
    await userEvent.type(screen.getByLabelText('上线说明'), '首发')
    await userEvent.click(screen.getByRole('button', { name: '上线到测试' }))
    expect(await screen.findByText(/测试已更新到 v2，上线 1 项：get-x v2/)).toBeInTheDocument()
    expect(calls.find((call) => call.url === '/gateway/v1/release')?.body).toEqual({
      stage: 'TEST', targets: [{ kind: 'api', id: 'a1' }], note: '首发', reason: '', force: false,
    })
  })

  it('shows how RELEASE would differ from PRE and releases once a reason is given', async () => {
    const calls = serve((call) => (call.body as { reason: string }).reason
      ? { body: { stage: 'RELEASE', version: 3, released: [{ kind: 'api', id: 'a1', name: 'get-x', version: 1, previous: 0 }] } }
      : { status: 409, body: { error: 'RELEASE would differ from PRE for get-x; give a reason to release anyway', diffs: [{ kind: 'api', id: 'a1', name: 'get-x', diff: { timeouts: { before: 0, after: 5000 } } }] } })
    page('/release?select=api:a1')
    await userEvent.selectOptions(await screen.findByLabelText('环境'), 'RELEASE')
    await userEvent.click(await screen.findByRole('button', { name: '上线到生产' }))
    expect(await screen.findByText('与预发不一致')).toBeInTheDocument()
    expect(screen.getByText('timeouts')).toBeInTheDocument()
    expect(screen.getByLabelText('原因')).toHaveAttribute('placeholder', '原因（必填）')
    await userEvent.type(screen.getByLabelText('原因'), '紧急修复')
    await userEvent.click(screen.getByRole('button', { name: '上线到生产' }))
    expect(await screen.findByText(/生产已更新到 v3/)).toBeInTheDocument()
    expect(calls.filter((call) => call.url === '/gateway/v1/release')).toHaveLength(2)
  })
})
