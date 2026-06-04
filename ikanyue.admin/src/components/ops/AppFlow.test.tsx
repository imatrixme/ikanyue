import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../../App'
import { createMockOpsApi } from '../../app/api'
import { mockDashboard, mockProfiles } from '../../app/mockData'
import type { OpsApi } from '../../app/api'

async function loginAsAdmin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('账号或手机号'), 'admin')
  await user.type(screen.getByLabelText('密码'), 'secret')
  await user.click(screen.getByRole('button', { name: '登录' }))
}

describe('ops admin app flow', () => {
  it('logs in, loads dashboard, navigates resources, and opens share preview', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await loginAsAdmin(user)
    expect(await screen.findByText('运营总览')).toBeInTheDocument()
    expect(await screen.findByText('186')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '学员' }))
    expect(await screen.findByText('学员管理')).toBeInTheDocument()
    expect(await screen.findByText('小张')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '审计' }))
    expect(await screen.findByText('审计日志')).toBeInTheDocument()
    expect(await screen.findByText('ops.assessment_record.submit')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估表' }))
    expect(await screen.findByText('评估表模板')).toBeInTheDocument()
    expect(await screen.findByText('声乐阶段测评')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估工作台' }))
    expect(await screen.findByText('实时评分')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '提交并生成报告' }))
    expect(await screen.findByText('评估报告')).toBeInTheDocument()
    expect(await screen.findByText('评估报告已生成')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '预览' })[0])
    await waitFor(() => expect(screen.getByText('分享报告预览')).toBeInTheDocument())
    expect(await screen.findByText('声乐阶段评估报告')).toBeInTheDocument()
  })

  it('filters resource rows through the view action', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '学员' }))
    await user.type(screen.getByLabelText('学员管理搜索'), '小李')
    await user.click(screen.getByRole('button', { name: '刷新' }))

    expect(await screen.findByText('小李')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('小张')).not.toBeInTheDocument())
  })

  it('creates managed resources and template drafts from the app', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '活动' }))
    await user.click(await screen.findByRole('button', { name: '新建活动' }))
    await user.type(await screen.findByLabelText('标题'), '端到端公开课')
    await user.selectOptions(screen.getByLabelText('状态'), 'active')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('已创建记录')).toBeInTheDocument()
    expect(await screen.findByText('端到端公开课')).toBeInTheDocument()

    await user.click((await screen.findAllByRole('button', { name: '转草稿' }))[0])
    expect(await screen.findByText('已转为草稿')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估表' }))
    await user.click(await screen.findByRole('button', { name: '新建模板' }))
    expect(await screen.findByText('已创建模板草稿')).toBeInTheDocument()
    expect(await screen.findByText('声乐阶段测评 副本')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '发布' })[0])
    expect(await screen.findByText('模板已发布')).toBeInTheDocument()
  })

  it('surfaces create, update, publish, assessment, and share failures', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      createResource: async () => {
        throw new Error('create down')
      },
      updateResource: async () => {
        throw new Error('update down')
      },
      publishTemplate: async () => {
        throw new Error('publish down')
      },
      createAssessment: async () => {
        throw new Error('assessment down')
      },
      createShareLink: async () => {
        throw new Error('share down')
      },
    }
    render(<App api={api} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '活动' }))
    await user.click(await screen.findByRole('button', { name: '新建活动' }))
    await user.click(await screen.findByRole('button', { name: '保存' }))
    expect(await screen.findByText('create down')).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: '编辑' }))[0])
    await user.click(await screen.findByRole('button', { name: '保存' }))
    expect(await screen.findByText('update down')).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: '发布' }))[0])
    expect(await screen.findByText('update down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估表' }))
    await user.click(await screen.findAllByRole('button', { name: '发布' }).then((buttons) => buttons[0]))
    expect(await screen.findByText('publish down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估工作台' }))
    await user.click(await screen.findByRole('button', { name: '提交并生成报告' }))
    expect(await screen.findByText('assessment down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '报告' }))
    await user.click((await screen.findAllByRole('button', { name: '创建分享' }))[0])
    expect(await screen.findByText('share down')).toBeInTheDocument()
  })

  it('surfaces report detail and share revoke failures', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      getReport: async () => {
        throw new Error('detail down')
      },
      revokeShareLink: async () => {
        throw new Error('revoke down')
      },
    }
    render(<App api={api} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '报告' }))
    await user.click((await screen.findAllByRole('button', { name: '查看' }))[0])
    expect(await screen.findByText('detail down')).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: '创建分享' }))[0])
    expect(await screen.findByText('分享链接已创建')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '撤销分享' }))
    expect(await screen.findByText('revoke down')).toBeInTheDocument()
  })

  it('prevents assessment submission when no student is available', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      listResource: async (resource, token, query) => {
        if (resource === 'students' && !query?.q) {
          return { items: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 0 } }
        }
        return createMockOpsApi().listResource(resource, token, query)
      },
    }
    render(<App api={api} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '评估工作台' }))
    await user.click(await screen.findByRole('button', { name: '提交并生成报告' }))
    expect(await screen.findByText('缺少可用模板或学员')).toBeInTheDocument()
  })

  it('handles template creation edge states', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      listTemplates: async () => ({ items: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 0 } }),
    }
    render(<App api={api} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '评估表' }))
    await user.click(await screen.findByRole('button', { name: '新建模板' }))
    expect(await screen.findByText('没有可复制的模板')).toBeInTheDocument()
  })

  it('forces default admin to change password before loading admin views', async () => {
    const user = userEvent.setup()
    let dashboardCalls = 0
    const api: OpsApi = {
      ...createMockOpsApi(),
      login: async () => ({
        token: 'forced-token',
        profile: { ...mockProfiles.admin, passwordChangeRequired: true },
      }),
      changePassword: async (token, data) => {
        expect(token).toBe('forced-token')
        expect(data).toMatchObject({
          currentPassword: 'admin1234',
          newPassword: 'newAdmin1234',
          confirmPassword: 'newAdmin1234',
        })
        return {
          token: 'changed-token',
          profile: { ...mockProfiles.admin, passwordChangeRequired: false },
        }
      },
      dashboard: async () => {
        dashboardCalls += 1
        return mockDashboard
      },
    }
    render(<App api={api} />)

    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'admin1234')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('修改初始密码')).toBeInTheDocument()
    expect(dashboardCalls).toBe(0)
    await user.type(screen.getByLabelText('当前密码'), 'admin1234')
    await user.type(screen.getByLabelText('新密码'), 'newAdmin1234')
    await user.type(screen.getByLabelText('确认新密码'), 'newAdmin1234')
    await user.click(screen.getByRole('button', { name: '确认修改' }))

    expect(await screen.findByText('运营总览')).toBeInTheDocument()
    expect(dashboardCalls).toBe(1)
  })

  it('surfaces password change failures while staying on first-login guard', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      login: async () => ({
        token: 'forced-token',
        profile: { ...mockProfiles.admin, passwordChangeRequired: true },
      }),
      changePassword: async () => {
        throw new Error('change down')
      },
      dashboard: async () => {
        throw new Error('dashboard should not load')
      },
    }
    render(<App api={api} />)

    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'admin1234')
    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.type(await screen.findByLabelText('当前密码'), 'bad-password')
    await user.type(screen.getByLabelText('新密码'), 'newAdmin1234')
    await user.type(screen.getByLabelText('确认新密码'), 'newAdmin1234')
    await user.click(screen.getByRole('button', { name: '确认修改' }))

    expect(await screen.findByText('change down')).toBeInTheDocument()
    expect(screen.getByText('修改初始密码')).toBeInTheDocument()
  })

  it('uses fallback error text for template creation failures', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      createTemplate: async () => {
        throw 'plain create template failure'
      },
    }
    render(<App api={api} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '评估表' }))
    await user.click(await screen.findByRole('button', { name: '新建模板' }))
    expect(await screen.findByText('创建模板失败')).toBeInTheDocument()
  })

  it('keeps teacher accounts away from admin-only navigation', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await user.type(screen.getByLabelText('账号或手机号'), '13800138001')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('运营总览')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '教师' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '评估表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '审计' })).not.toBeInTheDocument()
  })

  it('shows login and loading errors from app-level handlers', async () => {
    const user = userEvent.setup()
    render(<App api={{ ...createMockOpsApi(), dashboard: async () => { throw new Error('dashboard down') } }} />)

    await loginAsAdmin(user)
    expect(await screen.findByText('dashboard down')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(await screen.findByText('账号或手机号登录')).toBeInTheDocument()
  })

  it('surfaces denied admin navigation and resource search failures', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      listResource: async () => {
        throw 'plain list failure'
      },
    }
    render(<App api={api} />)

    await user.type(screen.getByLabelText('账号或手机号'), '13800138001')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.click(await screen.findByRole('button', { name: '学员' }))
    expect(await screen.findByText('加载失败')).toBeInTheDocument()
  })
})
