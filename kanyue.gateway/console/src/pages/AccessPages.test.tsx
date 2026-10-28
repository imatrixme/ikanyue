import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { mockFetch } from '../test/fetch'
import { ApprovalsPage, ComparePage, TokensPage } from './AccessPages'

const records = (items: unknown[]) => ({ body: { items } })

describe('TokensPage', () => {
  it('mints a releaser token for chosen environments and shows it once', async () => {
    const calls = mockFetch({
      'GET /api/collections/admin_tokens/records': records([]),
      'POST /gateway/v1/tokens': { body: { token: 'kgt_abc', record: { id: 't1', name: 'ci' } } },
    })
    render(<TokensPage />)
    await userEvent.type(screen.getByLabelText('名称'), 'ci')
    await userEvent.selectOptions(screen.getByLabelText('角色'), 'releaser')
    await userEvent.click(screen.getByRole('checkbox', { name: '测试' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '预发' }))
    await userEvent.click(screen.getByRole('button', { name: '生成令牌' }))
    expect(await screen.findByText('kgt_abc')).toBeInTheDocument()
    expect(screen.getByText(/只显示这一次/)).toBeInTheDocument()
    expect(calls.find((call) => call.url === '/gateway/v1/tokens')?.body).toEqual({
      name: 'ci', role: 'releaser', stages: ['TEST', 'PRE'], expires: '', note: '',
    })
  })
})

describe('ApprovalsPage', () => {
  it('approves a pending release to RELEASE', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const calls = mockFetch({
      'GET /gateway/v1/approvals': {
        body: [{
          id: 'p1', created: '2026-10-28T10:00:00Z', stage: 'RELEASE', requester: 'token:ci', approver: '', status: 'pending',
          decided: '', stageVersion: 0, error: '',
          request: { stage: 'RELEASE', targets: [{ kind: 'api', id: 'a1' }], note: '首发', reason: '与预发一致' },
          changes: [{ kind: 'api', id: 'a1', name: 'get-x', version: 0, previous: 0, diff: { timeouts: { before: null, after: 5000 } } }],
        }],
      },
      'POST /gateway/v1/approvals/p1/approve': { body: { stage: 'RELEASE', version: 4, released: [] } },
    })
    render(<ApprovalsPage />)
    expect(await screen.findByText('get-x')).toBeInTheDocument()
    expect(screen.getByText('timeouts')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '批准' }))
    expect(await screen.findByText('生产已更新到 v4。')).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'POST' && call.url === '/gateway/v1/approvals/p1/approve')).toBe(true)
  })
})

describe('ComparePage', () => {
  it('lists what two environments serve differently', async () => {
    const calls = mockFetch({
      'GET /gateway/v1/compare': { body: [{ kind: 'api', id: 'a1', name: 'get-x', fromVersion: 3, toVersion: 0, diff: { group: { before: 'g1', after: null } } }] },
    })
    render(<ComparePage />)
    expect(await screen.findByText('get-x')).toBeInTheDocument()
    expect(screen.getByText('v3')).toBeInTheDocument()
    expect(screen.getByText('未上线')).toBeInTheDocument()
    expect(calls[0].url).toBe('/gateway/v1/compare?from=PRE&to=RELEASE')
  })
})
