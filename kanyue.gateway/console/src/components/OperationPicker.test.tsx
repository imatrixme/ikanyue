import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { mockFetch } from '../test/fetch'
import { OperationPicker } from './OperationPicker'

const op = (id: string, module: string, path: string, status: string) =>
  ({ id, service: 's1', method: 'GET', path, module, auth: 'user', idempotent: true, status })

function serve() {
  return mockFetch({
    'GET /api/collections/operations/records': {
      body: {
        items: [
          op('a1', 'booking', '/v1/bookings', 'active'),
          op('a2', 'booking', '/v1/bookings/{id}', 'pending'),
          op('a3', 'booking', '/v1/bookings/legacy', 'removed'),
          op('b1', 'internal', '/internal/jobs', 'pending'),
        ],
      },
    },
  })
}

describe('OperationPicker', () => {
  it('preselects nothing and only queries the chosen service', async () => {
    const calls = serve()
    render(<OperationPicker onChange={vi.fn()} service="s1" value={[]} />)
    await screen.findByText('已选 0 / 4 个接口。新发现的接口不会自动加入；内部接口不要勾选。')
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked()
    expect(decodeURIComponent(calls[0].url)).toContain('filter=service="s1"')
  })

  it('selects a module without removed operations or other modules', async () => {
    serve()
    const onChange = vi.fn()
    render(<OperationPicker onChange={onChange} service="s1" value={[]} />)
    const booking = (await screen.findByText('booking')).closest('fieldset')!
    await userEvent.click(within(booking).getByRole('button', { name: '全选本组' }))
    expect(onChange).toHaveBeenLastCalledWith(['a1', 'a2'])
    expect(screen.getByRole('checkbox', { name: /legacy/ })).toBeDisabled()
  })

  it('ticks one operation at a time and keeps the rest', async () => {
    serve()
    const onChange = vi.fn()
    render(<OperationPicker onChange={onChange} service="s1" value={['a1']} />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /internal\/jobs/ }))
    expect(onChange).toHaveBeenLastCalledWith(['a1', 'b1'])
  })

  it('flags selections that belong to another service', async () => {
    serve()
    const onChange = vi.fn()
    render(<OperationPicker onChange={onChange} service="s1" value={['a1', 'other']} />)
    await userEvent.click(await screen.findByRole('button', { name: '移除这些接口' }))
    expect(onChange).toHaveBeenLastCalledWith(['a1'])
  })
})
