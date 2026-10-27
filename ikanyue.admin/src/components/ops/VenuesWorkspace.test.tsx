import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { createHttpVenueOpsApi } from '../../app/venueApi'
import { VenuesWorkspace } from './VenuesWorkspace'

describe('venues workspace', () => {
  it('creates, edits, deactivates and restores venues', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    render(<VenuesWorkspace api={api} token="token" />)

    expect((await screen.findAllByText('看乐艺术')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '新增场馆' }))
    const drawer = screen.getByRole('dialog', { name: '新增场馆' })
    await user.type(within(drawer).getByLabelText('场馆名称'), '看乐二店')
    await user.type(within(drawer).getByLabelText('营业时间'), '周末 10:00-18:00')
    await user.click(within(drawer).getByRole('switch', { name: /开放在线约课/ }))
    await user.click(within(drawer).getByRole('button', { name: '创建场馆' }))
    expect((await screen.findAllByText('看乐二店')).length).toBeGreaterThan(0)
    expect((await api.listVenues('token')).items.find((venue) => venue.name === '看乐二店')).toMatchObject({ bookable: false, openingHours: '周末 10:00-18:00' })

    await user.click(screen.getAllByRole('button', { name: '编辑看乐二店' })[0])
    const editDrawer = screen.getByRole('dialog', { name: '编辑看乐二店' })
    await user.clear(within(editDrawer).getByLabelText('地址'))
    await user.type(within(editDrawer).getByLabelText('地址'), '二店地址')
    await user.click(within(editDrawer).getByRole('button', { name: '保存场馆' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑看乐二店' })).not.toBeInTheDocument())

    await user.click(screen.getAllByRole('button', { name: '停用看乐二店' })[0])
    await user.click(screen.getByRole('button', { name: '确认停用' }))
    expect((await screen.findAllByRole('button', { name: '恢复看乐二店' })).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: '恢复看乐二店' })[0])
    expect((await screen.findAllByRole('button', { name: '停用看乐二店' })).length).toBeGreaterThan(0)
    expect((await api.listVenues('token')).items.find((venue) => venue.name === '看乐二店')).toMatchObject({ address: '二店地址', status: 'active' })
  })

  it('shows load and save failures without losing the form', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'listVenues').mockRejectedValueOnce(new Error('场馆加载失败'))
    vi.spyOn(api, 'createVenue').mockRejectedValueOnce(new Error('场馆名称不能超过 40 个字'))
    render(<VenuesWorkspace api={api} token="token" />)

    expect(await screen.findByText('场馆加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新增场馆' }))
    const drawer = screen.getByRole('dialog', { name: '新增场馆' })
    await user.type(within(drawer).getByLabelText('场馆名称'), '新场馆')
    await user.click(within(drawer).getByRole('button', { name: '创建场馆' }))
    expect(await screen.findByText('场馆名称不能超过 40 个字')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog', { name: '新增场馆' })).getByLabelText('场馆名称')).toHaveValue('新场馆')
  })

  it('calls the ops venue endpoints over HTTP', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 10000, data: { items: [] } }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpVenueOpsApi('/ops')
    await api.listVenues('token')
    await api.updateVenue('token', 'venue 1', { status: 'inactive' })
    expect(fetchMock.mock.calls.map((call) => String((call as unknown[])[0]))).toEqual(['/ops/venues', '/ops/venues/venue%201'])
    vi.unstubAllGlobals()
  })
})
