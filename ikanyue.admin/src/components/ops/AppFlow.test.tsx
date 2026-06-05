import { render, screen, waitFor, within } from '@testing-library/react'
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

async function enterProjectWorkspace(user: ReturnType<typeof userEvent.setup>, taskName?: RegExp) {
  expect(await screen.findByText('当前项目')).toBeInTheDocument()
  if (!taskName) {
    return
  }
  await user.click(screen.getByRole('button', { name: '更换项目' }))
  let setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
  if (taskName) {
    await user.click(within(setupDialog).getByRole('button', { name: taskName }))
  }
  await user.click(within(setupDialog).getByRole('button', { name: '下一步：确认项目' }))
  setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
  await user.click(within(setupDialog).getByRole('button', { name: '进入项目工作台' }))
  expect(await screen.findByText('当前项目')).toBeInTheDocument()
}

async function enterLessonWorkspace(user: ReturnType<typeof userEvent.setup>, taskName?: RegExp) {
  expect(await screen.findByText('当前课次')).toBeInTheDocument()
  if (!taskName) {
    return
  }
  await user.click(screen.getByRole('button', { name: '更换课次' }))
  let setupDialog = await screen.findByRole('dialog', { name: '配置课次工作台' })
  if (taskName) {
    await user.click(within(setupDialog).getByRole('button', { name: taskName }))
  }
  await user.click(within(setupDialog).getByRole('button', { name: '下一步：确认课次' }))
  setupDialog = await screen.findByRole('dialog', { name: '配置课次工作台' })
  await user.click(within(setupDialog).getByRole('button', { name: '进入课次工作台' }))
  expect(await screen.findByText('当前课次')).toBeInTheDocument()
}

async function saveVisibleResourceForm(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole('dialog')
  let next = within(dialog).queryByRole('button', { name: '下一步' })
  while (next) {
    await user.click(next)
    next = within(dialog).queryByRole('button', { name: '下一步' })
  }
  expect(within(dialog).getByText('变更一览')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: '保存' }))
}

async function savePeopleAction(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  options: {
    searchLabel?: string
    search?: string
    chooseName?: string | RegExp
    modeLabel?: string
    mode?: string
  } = {},
) {
  if (options.search && options.searchLabel) {
    await user.type(within(dialog).getByLabelText(options.searchLabel), options.search)
  }
  if (options.chooseName) {
    await user.click(within(dialog).getByRole('button', { name: options.chooseName }))
  }
  if (options.modeLabel && options.mode) {
    await user.selectOptions(within(dialog).getByLabelText(options.modeLabel), options.mode)
  }
  expect(within(dialog).getByText('本次保存')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: '保存关系' }))
}

describe('ops admin app flow', () => {
  it('persists authenticated sessions across remounts and clears them on logout', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App api={createMockOpsApi()} />)

    await loginAsAdmin(user)
    expect(await screen.findByText('教务运营驾驶舱')).toBeInTheDocument()
    unmount()

    const restored = render(<App api={createMockOpsApi()} />)
    expect(await screen.findByText('教务运营驾驶舱')).toBeInTheDocument()
    expect(screen.queryByText('账号或手机号登录')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(await screen.findByText('账号或手机号登录')).toBeInTheDocument()

    restored.unmount()
    render(<App api={createMockOpsApi()} />)
    expect(await screen.findByText('账号或手机号登录')).toBeInTheDocument()
  })

  it('logs in, loads dashboard, navigates resources, and opens share preview', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await loginAsAdmin(user)
    expect(await screen.findByText('教务运营驾驶舱')).toBeInTheDocument()
    expect(await screen.findByText('186')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '学员' }))
    expect(await screen.findByText('学员管理')).toBeInTheDocument()
    expect(await screen.findByText('小张')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '审计日志' }))
    expect(await screen.findByRole('heading', { name: '审计日志' })).toBeInTheDocument()
    expect(await screen.findByText('提交评估')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估表模板' }))
    expect(await screen.findByRole('heading', { name: '评估表模板' })).toBeInTheDocument()
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
    await user.click(await screen.findByRole('button', { name: '活动内容' }))
    await user.click(await screen.findByRole('button', { name: '新建活动' }))
    expect(await screen.findByRole('dialog', { name: '新建活动' })).toBeInTheDocument()
    await user.type(await screen.findByLabelText('标题'), '端到端公开课')
    await user.selectOptions(screen.getByLabelText('状态'), 'active')
    await saveVisibleResourceForm(user)
    expect(await screen.findByText('已创建记录')).toBeInTheDocument()
    expect(await screen.findByText('端到端公开课')).toBeInTheDocument()

    await user.click((await screen.findAllByRole('button', { name: '转草稿' }))[0])
    expect(await screen.findByText('已转为草稿')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估表模板' }))
    await user.click(await screen.findByRole('button', { name: '新建模板' }))
    expect(await screen.findByText('已创建模板草稿')).toBeInTheDocument()
    expect(await screen.findByText('声乐阶段测评 副本')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '发布' })[0])
    expect(await screen.findByText('模板已发布')).toBeInTheDocument()
  })

  it('opens scene workspaces and saves context-locked relations through the app', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '项目工作台' }))
    expect(await screen.findByText('围绕一个教学项目管理学员、教师、课次和下一步动作；关系表只作为结果和维护视图。')).toBeInTheDocument()
    await enterProjectWorkspace(user)
    await user.click(screen.getByRole('button', { name: '添加项目学员' }))
    const projectDialog = await screen.findByRole('dialog', { name: '添加项目学员' })
    expect(projectDialog).toHaveTextContent('春季体验课')
    await savePeopleAction(user, projectDialog, {
      searchLabel: '选择学员搜索',
      search: '小李',
      chooseName: '选择李同学',
    })
    expect(await screen.findByText('已保存 2 条场景关系')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '课次工作台' }))
    expect(await screen.findByText('围绕一堂真实课程确认时间、地点、出勤、教师和课后动作；无需理解课次关系表。')).toBeInTheDocument()
    await enterLessonWorkspace(user, /确认实际老师/)
    await user.click(screen.getByRole('button', { name: '确认课次教师' }))
    const lessonDialog = await screen.findByRole('dialog', { name: '确认课次教师' })
    expect(lessonDialog).toHaveTextContent('体验课第一堂')
    await savePeopleAction(user, lessonDialog, {
      searchLabel: '选择教师搜索',
      search: '赵老师',
      chooseName: '选择赵老师',
    })
    expect(await screen.findByText('已保存 2 条场景关系')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '记录出勤' }))
    const attendanceDialog = await screen.findByRole('dialog', { name: '记录课次出勤' })
    await savePeopleAction(user, attendanceDialog, {
      modeLabel: '出勤结果',
      mode: 'present',
    })
    expect(await screen.findByText('已保存 2 条场景关系')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '项目工作台' }))
    await enterProjectWorkspace(user, /安排项目老师/)
    await user.click(screen.getByRole('button', { name: '分配项目教师' }))
    const teacherDialog = await screen.findByRole('dialog', { name: '分配项目教师' })
    await savePeopleAction(user, teacherDialog, {
      modeLabel: '项目角色',
      mode: 'assistant',
    })
    expect(await screen.findByText('已保存 1 条场景关系')).toBeInTheDocument()
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
    await user.click(await screen.findByRole('button', { name: '活动内容' }))
    await user.click(await screen.findByRole('button', { name: '新建活动' }))
    await saveVisibleResourceForm(user)
    expect(await screen.findByText('create down')).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: '编辑' }))[0])
    await saveVisibleResourceForm(user)
    expect(await screen.findByText('update down')).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: '发布' }))[0])
    expect(await screen.findByText('update down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估表模板' }))
    await user.click(await screen.findAllByRole('button', { name: '发布' }).then((buttons) => buttons[0]))
    expect(await screen.findByText('publish down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '评估工作台' }))
    await user.click(await screen.findByRole('button', { name: '提交并生成报告' }))
    expect(await screen.findByText('assessment down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '报告历史' }))
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
    await user.click(await screen.findByRole('button', { name: '报告历史' }))
    await user.click((await screen.findAllByRole('button', { name: '查看' }))[0])
    expect(await screen.findByText('detail down')).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: '创建分享' }))[0])
    expect(await screen.findByText('分享链接已创建')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '撤销分享' }))
    expect(await screen.findByText('revoke down')).toBeInTheDocument()
  })

  it('uses fallback text for non-Error share failures', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      createShareLink: async () => {
        throw 'plain share failure'
      },
      revokeShareLink: async () => {
        throw 'plain revoke failure'
      },
    }
    render(<App api={api} />)

    await loginAsAdmin(user)
    await user.click(await screen.findByRole('button', { name: '报告历史' }))
    await user.click((await screen.findAllByRole('button', { name: '创建分享' }))[0])
    expect(await screen.findByText('创建分享失败')).toBeInTheDocument()

    await user.click((await screen.findAllByRole('button', { name: '预览' }))[0])
    expect(await screen.findByText('创建分享失败')).toBeInTheDocument()
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
    await user.click(await screen.findByRole('button', { name: '评估表模板' }))
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
          currentPassword: '1loveU_shaoyi',
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
    await user.type(screen.getByLabelText('密码'), '1loveU_shaoyi')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('修改初始密码')).toBeInTheDocument()
    expect(dashboardCalls).toBe(0)
    await user.type(screen.getByLabelText('当前密码'), '1loveU_shaoyi')
    await user.type(screen.getByLabelText('新密码'), 'newAdmin1234')
    await user.type(screen.getByLabelText('确认新密码'), 'newAdmin1234')
    await user.click(screen.getByRole('button', { name: '确认修改' }))

    expect(await screen.findByText('教务运营驾驶舱')).toBeInTheDocument()
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
    await user.type(screen.getByLabelText('密码'), '1loveU_shaoyi')
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
    await user.click(await screen.findByRole('button', { name: '评估表模板' }))
    await user.click(await screen.findByRole('button', { name: '新建模板' }))
    expect(await screen.findByText('创建模板失败')).toBeInTheDocument()
  })

  it('keeps teacher accounts away from admin-only navigation', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await user.type(screen.getByLabelText('账号或手机号'), '13800138001')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('王老师，先处理今天的课')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '教师' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '运营流程' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '报告事件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '评估表模板' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '审计日志' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '系统设置' })).not.toBeInTheDocument()
  })

  it('opens grouped system settings for administrators without exposing secrets', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await loginAsAdmin(user)
    expect(await screen.findByText('教务核心')).toBeInTheDocument()
    expect(screen.getByText('活动与内容')).toBeInTheDocument()
    expect(screen.getByText('测评与报告')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '系统设置' })[1])

    expect(await screen.findByText('注册开关')).toBeInTheDocument()
    expect(screen.getByText('账号策略')).toBeInTheDocument()
    expect(screen.getByText('小程序配置')).toBeInTheDocument()
    expect(screen.getByText('资源域名')).toBeInTheDocument()
    expect(screen.getByText('不在前端展示')).toBeInTheDocument()
    expect(screen.queryByText('APPSECRET')).not.toBeInTheDocument()
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
