import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../../App'
import { createMockOpsApi } from '../../app/api'
import type { OpsApi } from '../../app/api'
import type { OpsResource, ResourceRecord } from '../../app/types'

async function loginAsAdmin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('账号或手机号'), 'admin')
  await user.type(screen.getByLabelText('密码'), 'secret')
  await user.click(screen.getByRole('button', { name: '登录' }))
}

async function navigateTo(user: ReturnType<typeof userEvent.setup>, itemName: string | RegExp, groupName: string) {
  if (screen.queryAllByRole('button', { name: itemName }).length === 0 || itemName === groupName) {
    await user.click(await screen.findByRole('button', { name: groupName }))
  }
  const matches = await screen.findAllByRole('button', { name: itemName })
  await user.click(matches[matches.length - 1])
}

describe('guided ops app flow', () => {
  it('drops corrupted cached sessions before showing login', () => {
    localStorage.setItem('kanyue.ops.session', '{broken-json')
    render(<App api={createMockOpsApi()} />)

    expect(screen.getByText('账号或手机号登录')).toBeInTheDocument()
    expect(localStorage.getItem('kanyue.ops.session')).toBeNull()
  })

  it('loads the guided workspace from navigation and executes generated operations', async () => {
    const user = userEvent.setup()
    const baseApi = createMockOpsApi()
    const created: Array<{ resource: OpsResource; token: string; data: Record<string, unknown> }> = []
    const api: OpsApi = {
      ...baseApi,
      async createResource(resource, token, data) {
        created.push({ resource, token, data })
        return baseApi.createResource(resource, token, data)
      },
    }
    render(<App api={api} />)

    await loginAsAdmin(user)
    expect(await screen.findByText('今天先把教务闭环推进')).toBeInTheDocument()

    await navigateTo(user, '新建事务', '工作台')
    expect(await screen.findByRole('heading', { name: '新建事务' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: '发布招生活动' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /发布可报名活动/ }))
    const dialog = await screen.findByRole('dialog', { name: '发布可报名活动' })
    fireEvent.change(within(dialog).getByLabelText('活动标题'), { target: { value: '端到端体验营' } })
    await user.click(within(dialog).getByRole('button', { name: /人物.*谁负责和授课/ }))
    await user.click(within(dialog).getByLabelText(/王老师/))
    await user.click(within(dialog).getByRole('button', { name: /保存前检查.*这次会保存哪些内容/ }))
    await user.click(within(dialog).getByRole('button', { name: '确认保存' }))

    await waitFor(() => expect(created.map((item) => item.resource)).toEqual(expect.arrayContaining(['activities', 'operationSlots', 'learningPrograms', 'learningSessions'])))
    expect(created[0]).toMatchObject({
      resource: 'activities',
      token: 'mock-token-admin_1',
      data: { title: '端到端体验营', status: 'active' },
    })
    expect(created.some((item) => item.resource === 'programTeachers' && item.data.teacherId === 'teacher_1')).toBe(true)
    expect(await screen.findByText('已创建 6 个相关记录')).toBeInTheDocument()
  })

  it('surfaces guided operation failures without leaving the workspace', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      createResource: async (): Promise<ResourceRecord> => {
        throw new Error('guided create down')
      },
    }
    render(<App api={api} />)

    await loginAsAdmin(user)
    await navigateTo(user, '新建事务', '工作台')
    await user.click(await screen.findByRole('tab', { name: '发起测评/报告' }))
    await user.click(await screen.findByRole('button', { name: /发起测评报告/ }))
    const dialog = await screen.findByRole('dialog', { name: '发起测评报告' })
    await user.click(within(dialog).getByRole('button', { name: /保存前检查.*这次会保存哪些内容/ }))
    await user.click(within(dialog).getByRole('button', { name: '确认保存' }))

    expect(await screen.findByText('guided create down')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '新建事务' })).toBeInTheDocument()
  })
})
