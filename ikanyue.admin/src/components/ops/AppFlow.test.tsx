import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../../App'
import { createMockOpsApi } from '../../app/api'
import { mockProfiles, mockReports, mockResources, mockSharePreview, mockTemplates } from '../../app/mockData'
import type { OpsApi } from '../../app/api'
import { AssessmentWorkspace } from './AssessmentWorkspace'
import { DashboardView } from './DashboardView'
import { LoginView } from './LoginView'
import { ReportsView } from './ReportsView'
import { ResourceView } from './ResourceView'
import { SharePreviewView } from './SharePreviewView'
import { Shell } from './Shell'
import { TemplatesView } from './TemplatesView'

describe('ops admin app flow', () => {
  it('logs in, loads dashboard, navigates resources, and opens share preview', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await user.click(screen.getByRole('button', { name: '登录' }))
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

    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.click(await screen.findByRole('button', { name: '学员' }))
    await user.type(screen.getByLabelText('学员管理搜索'), '小李')
    await user.click(screen.getByRole('button', { name: '刷新' }))

    expect(await screen.findByText('小李')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('小张')).not.toBeInTheDocument())
  })

  it('creates managed resources and template drafts from the app', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await user.click(screen.getByRole('button', { name: '登录' }))
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

    await user.click(screen.getByRole('button', { name: '登录' }))
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

    await user.click(screen.getByRole('button', { name: '登录' }))
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

    await user.click(screen.getByRole('button', { name: '登录' }))
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

    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.click(await screen.findByRole('button', { name: '评估表' }))
    await user.click(await screen.findByRole('button', { name: '新建模板' }))
    expect(await screen.findByText('没有可复制的模板')).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.click(await screen.findByRole('button', { name: '评估表' }))
    await user.click(await screen.findByRole('button', { name: '新建模板' }))
    expect(await screen.findByText('创建模板失败')).toBeInTheDocument()
  })

  it('keeps teacher accounts away from admin-only navigation', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await user.clear(screen.getByLabelText('手机号'))
    await user.type(screen.getByLabelText('手机号'), '13800138001')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('运营总览')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '教师' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '评估表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '审计' })).not.toBeInTheDocument()
  })

  it('shows login and loading errors from app-level handlers', async () => {
    const user = userEvent.setup()
    render(<App api={{ ...createMockOpsApi(), dashboard: async () => { throw new Error('dashboard down') } }} />)

    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByText('dashboard down')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(await screen.findByText('登录后台')).toBeInTheDocument()
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

    await user.clear(screen.getByLabelText('手机号'))
    await user.type(screen.getByLabelText('手机号'), '13800138001')
    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.click(await screen.findByRole('button', { name: '学员' }))
    expect(await screen.findByText('加载失败')).toBeInTheDocument()
  })
})

describe('standalone ops components', () => {
  it('renders dashboard and share preview states', () => {
    const { rerender } = render(<DashboardView data={{ cards: [{ key: 'students', label: '学员', value: 2 }, { key: 'custom', label: '自定义', value: 1 }], pending: [] }} />)
    expect(screen.getByText('运营总览')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('自定义')).toBeInTheDocument()

    rerender(<DashboardView data={null} />)
    expect(screen.getByText('待处理')).toBeInTheDocument()
  })

  it('renders empty share state and report preview', () => {
    const { rerender } = render(<SharePreviewView preview={null} />)
    expect(screen.getByText('暂无分享报告')).toBeInTheDocument()

    rerender(<SharePreviewView preview={mockSharePreview} />)
    expect(screen.getByText('张同学')).toBeInTheDocument()
    expect(screen.getByText('86.2')).toBeInTheDocument()
  })

  it('exposes mock resource data for table-driven pages', () => {
    expect(mockResources.activities.items[0].title).toBe('周末声乐公开课')
    expect(mockResources.auditLogs.items[0].action).toBe('ops.assessment_record.submit')
  })

  it('renders login failure branch and loading label', async () => {
    const user = userEvent.setup()
    const failingApi = { ...createMockOpsApi(), login: async () => { throw new Error('bad login') } }
    const errors: string[] = []
    render(<LoginView api={failingApi} loading={true} errorMessage="错误消息" onSuccess={() => undefined} onError={(message) => errors.push(message)} />)

    expect(screen.getByText('错误消息')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登录中' })).toBeDisabled()
    await user.clear(screen.getByLabelText('手机号'))
    await user.type(screen.getByLabelText('手机号'), '13800138002')
    await user.click(screen.getByRole('button', { name: '登录中' }))
    expect(errors).toEqual([])

    render(<LoginView api={{ ...createMockOpsApi(), login: async () => { throw 'plain login' } }} loading={false} onSuccess={() => undefined} onError={(message) => errors.push(message)} />)
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(errors).toContain('登录失败')
  })

  it('renders resource search enter branch and create actions', async () => {
    const user = userEvent.setup()
    const searches: string[] = []
    const searchView = render(<ResourceView resource="activities" result={mockResources.activities} loading={true} onSearch={(keyword) => searches.push(keyword)} />)

    await user.type(screen.getByLabelText('活动内容搜索'), '公开课{Enter}')
    expect(searches).toContain('公开课')
    expect(screen.getByRole('button', { name: '加载中' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建活动' })).toBeInTheDocument()
    searchView.unmount()

    const slotView = render(<ResourceView resource="operationSlots" result={mockResources.operationSlots} loading={false} onSearch={() => undefined} onSave={() => searches.push('save')} />)
    await user.click(screen.getByRole('button', { name: '新建运营位' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(searches).toContain('save')
    slotView.unmount()

    const studentsView = render(<ResourceView resource="students" loading={false} onSearch={(keyword) => searches.push(keyword)} />)
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
    studentsView.unmount()

    const teachersView = render(<ResourceView resource="teachers" result={mockResources.teachers} loading={false} onSearch={() => undefined} />)
    expect(screen.getByText('待审核')).toBeInTheDocument()
    expect(screen.getByText('管理员')).toBeInTheDocument()
    teachersView.unmount()

    const updates: Array<Record<string, unknown>> = []
    render(<ResourceView resource="activities" result={mockResources.activities} loading={false} onSearch={() => undefined} onSave={(_, payload) => updates.push(payload)} onPublish={(row) => updates.push({ publish: row.id })} />)
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    await user.clear(screen.getByLabelText('标题'))
    await user.type(screen.getByLabelText('标题'), '编辑后的活动')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await user.click(screen.getAllByRole('button', { name: '发布' })[0])
    expect(updates).toContainEqual(expect.objectContaining({ title: '编辑后的活动' }))
    expect(updates).toContainEqual({ publish: 'activity_2' })
  })

  it('renders template, report, shell, and assessment edge states', async () => {
    const user = userEvent.setup()
    const changes: string[] = []
    render(
      <Shell
        activeView="dashboard"
        profile={{ ...mockProfiles.teacher, realName: '', nickName: '昵称老师' }}
        toast={{ type: 'info', message: '已保存' }}
        onViewChange={(view) => changes.push(view)}
        onLogout={() => changes.push('logout')}
      >
        <div>正文</div>
      </Shell>,
    )
    expect(screen.getByText('教师')).toBeInTheDocument()
    expect(screen.getByText('昵称老师')).toBeInTheDocument()
    expect(screen.getByText('已保存')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(changes).toContain('logout')

    render(
      <Shell
        activeView="students"
        profile={mockProfiles.admin}
        toast={{ type: 'error', message: '失败' }}
        onViewChange={(view) => changes.push(view)}
        onLogout={() => undefined}
      >
        <div>正文</div>
      </Shell>,
    )
    expect(screen.getByText('失败')).toBeInTheDocument()
  })

  it('covers assessment input variants and empty template state', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<AssessmentWorkspace template={null} />)
    expect(screen.getByText('暂无可用评估模板')).toBeInTheDocument()

    rerender(<AssessmentWorkspace template={mockTemplates.items[0]} />)
    await user.selectOptions(screen.getByLabelText('音准稳定性'), 'average')
    await user.clear(screen.getByLabelText('音准评语'))
    await user.type(screen.getByLabelText('音准评语'), '继续观察')
    await user.clear(screen.getByLabelText('气息支撑'))
    await user.type(screen.getByLabelText('气息支撑'), '90')
    await user.clear(screen.getByLabelText('舞台表现'))
    await user.type(screen.getByLabelText('舞台表现'), '88')
    expect(screen.getByText('实时评分')).toBeInTheDocument()

    rerender(<AssessmentWorkspace template={{
      ...mockTemplates.items[0],
      schemaJson: {
        sections: [{
          key: 'edge',
          title: '边界',
          weight: 1,
          items: [
            { key: 'empty_choice', label: '空选项', type: 'single_choice' },
            { key: 'rich', label: '长评语', type: 'rich_comment' },
          ],
        }],
        scoring: { type: 'weighted_sum', maxScore: 100, gradeBands: [] },
      },
      scoringJson: { type: 'weighted_sum', maxScore: 100, gradeBands: [] },
    }} />)
    expect(screen.getByText('空选项')).toBeInTheDocument()
  })

  it('renders templates and reports components directly', () => {
    const previews: string[] = []
    render(<TemplatesView data={mockTemplates} onCreate={() => previews.push('create')} onPublish={(id) => previews.push(id)} />)
    expect(screen.getByText('少儿节奏专项')).toBeInTheDocument()
    screen.getByRole('button', { name: '新建模板' }).click()
    screen.getAllByRole('button', { name: '发布' })[0].click()
    expect(previews).toContain('create')
    expect(previews).toContain('template_1')

    render(
      <ReportsView
        data={mockReports}
        detail={{
          id: 'report_1',
          title: '报告详情',
          student: { name: '张同学' },
          teacher: { name: '王老师' },
          score: { totalScore: 86.2, grade: 'B' },
          summary: '稳定',
          recommendations: ['继续练习'],
          sections: [{ key: 'pitch', title: '音准', score: 30, comment: '稳定' }],
          generatedAt: '2026-05-18T09:00:00.000Z',
        }}
        shareLink={{ id: 'share_1', reportId: 'report_1', token: 'share-token' }}
        onOpenDetail={(reportId) => previews.push(`detail:${reportId}`)}
        onCreateShare={(reportId) => previews.push(`share:${reportId}`)}
        onRevokeShare={(shareId) => previews.push(`revoke:${shareId}`)}
        onPreviewShare={(reportId) => previews.push(reportId)}
      />,
    )
    screen.getAllByRole('button', { name: '创建分享' })[0].click()
    screen.getAllByRole('button', { name: '预览' })[0].click()
    screen.getAllByRole('button', { name: '查看' })[0].click()
    screen.getByRole('button', { name: '撤销分享' }).click()
    expect(previews).toContain('report_1')
    expect(previews).toContain('share:report_1')
    expect(previews).toContain('detail:report_1')
    expect(previews).toContain('revoke:share_1')
    expect(screen.getByText('报告详情')).toBeInTheDocument()

    render(
      <ReportsView
        data={mockReports}
        detail={{
          id: 'report_2',
          title: '空详情',
          student: {},
          teacher: {},
          score: { totalScore: 0, grade: '-', sections: [{ key: 's', title: '维度' }] },
          generatedAt: '',
        }}
        shareLink={{ id: 'share_2', reportId: 'report_2', token: '', revokedAt: '2026-05-20T09:00:00.000Z' }}
        onOpenDetail={() => undefined}
        onCreateShare={() => undefined}
        onRevokeShare={() => undefined}
        onPreviewShare={() => undefined}
      />,
    )
    expect(screen.getAllByText('已撤销')[0]).toBeInTheDocument()
    expect(screen.getAllByText('-')[0]).toBeInTheDocument()
  })

  it('shows non-error messages for unknown callback failures', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      login: async () => {
        throw 'plain failure'
      },
      listResource: async () => {
        throw 'plain list failure'
      },
    }
    render(<App api={api} />)

    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByText('登录失败')).toBeInTheDocument()
  })
})
