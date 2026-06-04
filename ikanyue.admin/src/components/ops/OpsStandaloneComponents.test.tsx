import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../../App'
import { createMockOpsApi, type OpsApi } from '../../app/api'
import { mockProfiles, mockReports, mockResources, mockSharePreview, mockTemplates } from '../../app/mockData'
import { AssessmentWorkspace } from './AssessmentWorkspace'
import { DashboardView } from './DashboardView'
import { ForcePasswordChangeView } from './ForcePasswordChangeView'
import { LoginView } from './LoginView'
import { ReportsView } from './ReportsView'
import { ResourceView } from './ResourceView'
import { SharePreviewView } from './SharePreviewView'
import { Shell } from './Shell'
import { SystemSettingsView } from './SystemSettingsView'
import { TemplatesView } from './TemplatesView'

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
    await user.clear(screen.getByLabelText('账号或手机号'))
    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.click(screen.getByRole('button', { name: '登录中' }))
    expect(errors).toEqual([])

    render(<LoginView api={{ ...createMockOpsApi(), login: async () => { throw 'plain login' } }} loading={false} onSuccess={() => undefined} onError={(message) => errors.push(message)} />)
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(errors).toContain('登录失败')
  })

  it('renders forced password fallback branches', async () => {
    const user = userEvent.setup()
    const errors: string[] = []
    render(
      <ForcePasswordChangeView
        api={{ ...createMockOpsApi(), changePassword: async () => { throw 'plain password failure' } }}
        token="forced-token"
        profile={{ ...mockProfiles.admin, realName: '', nickName: '', cellphone: '13800138002' }}
        errorMessage="已有错误"
        onSuccess={() => undefined}
        onError={(message) => errors.push(message)}
      />,
    )

    expect(screen.getByText('已有错误')).toBeInTheDocument()
    expect(screen.getByText(/13800138002 首次登录后台前需要设置新的管理员密码/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认修改' }))
    expect(errors).toContain('修改密码失败')
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
    expect(screen.getByRole('dialog', { name: '新建运营位' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '新建运营位' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新建运营位' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(searches).toContain('save')
    slotView.unmount()

    const studentsView = render(<ResourceView resource="students" loading={false} onSearch={(keyword) => searches.push(keyword)} />)
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
    studentsView.unmount()

    const updates: Array<Record<string, unknown>> = []
    const studentEditor = render(<ResourceView resource="students" result={mockResources.students} loading={false} onSearch={() => undefined} onSave={(_, payload) => updates.push(payload)} />)
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    expect(screen.getByRole('dialog', { name: '编辑学员管理' })).toHaveClass('left-1/2')
    await user.clear(screen.getByLabelText('姓名'))
    await user.type(screen.getByLabelText('姓名'), '更新学员')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(updates).toContainEqual(expect.objectContaining({ realName: '更新学员', blocked: false }))
    studentEditor.unmount()

    const teachersView = render(<ResourceView resource="teachers" result={mockResources.teachers} loading={false} onSearch={() => undefined} />)
    expect(screen.getByText('待审核')).toBeInTheDocument()
    expect(screen.getByText('管理员')).toBeInTheDocument()
    teachersView.unmount()

    const teacherEditor = render(<ResourceView resource="teachers" result={mockResources.teachers} loading={false} onSearch={() => undefined} onSave={(_, payload) => updates.push(payload)} />)
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    expect(screen.getByRole('dialog', { name: '编辑教师管理' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog', { name: '编辑教师管理' })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    expect(screen.getByRole('switch', { name: '审核通过' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: '禁用账号' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: '管理员权限' })).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(updates).toContainEqual(expect.objectContaining({ verified: true, blocked: false, isAdmin: false }))
    teacherEditor.unmount()

    render(<ResourceView resource="activities" result={mockResources.activities} loading={false} onSearch={() => undefined} onSave={(_, payload) => updates.push(payload)} onPublish={(row) => updates.push({ publish: row.id })} />)
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    expect(screen.getByRole('dialog', { name: '编辑活动内容' })).toBeInTheDocument()
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
    expect(screen.getByRole('navigation', { name: '后台导航' }).closest('aside')).toHaveClass('lg:w-64')
    await user.click(screen.getByRole('button', { name: '收起侧边栏' }))
    expect(screen.getByRole('navigation', { name: '后台导航' }).closest('aside')).toHaveClass('lg:w-16')
    await user.click(screen.getByRole('button', { name: '展开侧边栏' }))
    expect(screen.getByRole('button', { name: '教务核心' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: '教务核心' }))
    expect(screen.getByRole('button', { name: '教务核心' })).toHaveAttribute('aria-expanded', 'false')
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

  it('renders system settings categories and operable switches without raw secret values', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<SystemSettingsView profile={mockProfiles.admin} />)

    expect(screen.getByText('注册开关')).toBeInTheDocument()
    expect(screen.getByText('账号策略')).toBeInTheDocument()
    expect(screen.getByText('小程序配置')).toBeInTheDocument()
    expect(screen.getByText('资源域名')).toBeInTheDocument()
    expect(screen.getByText('权限角色')).toBeInTheDocument()
    expect(screen.getByText('运维健康')).toBeInTheDocument()
    expect(screen.getByText('审计可见性')).toBeInTheDocument()
    expect(screen.getByText('不在前端展示')).toBeInTheDocument()
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '允许教务注册' })).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('switch', { name: '允许教务注册' }))
    expect(screen.getByRole('switch', { name: '允许教务注册' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('switch', { name: '注册后必须激活' }))
    await user.click(screen.getByRole('switch', { name: '首次登录强制改密' }))
    await user.click(screen.getByRole('switch', { name: '使用公开资源域名' }))
    await user.click(screen.getByRole('switch', { name: '显示健康状态' }))
    await user.click(screen.getByRole('switch', { name: '显示审计入口' }))
    expect(screen.getByRole('switch', { name: '显示审计入口' })).toHaveAttribute('aria-checked', 'false')

    rerender(<SystemSettingsView profile={{ ...mockProfiles.admin, passwordChangeRequired: true }} />)
    expect(screen.getByText('需改密')).toBeInTheDocument()
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

  it('uses semantic relation selectors and file controls in resource forms', async () => {
    const user = userEvent.setup()
    const updates: Array<Record<string, unknown>> = []

    const sessionView = render(<ResourceView resource="learningSessions" result={mockResources.learningSessions} loading={false} onSearch={() => undefined} onSave={(_, payload) => updates.push(payload)} resources={mockResources} />)
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    expect(screen.getByText('当前选择：春季体验课')).toBeInTheDocument()
    await user.type(screen.getByLabelText('所属项目'), '暑期')
    await user.click(screen.getByRole('button', { name: '暑期声乐包' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(updates).toContainEqual(expect.objectContaining({ programId: 'program_2' }))
    sessionView.unmount()

    const emptyRelationView = render(<ResourceView resource="learningSessions" result={mockResources.learningSessions} loading={false} onSearch={() => undefined} onSave={(_, payload) => updates.push(payload)} />)
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    expect(screen.getByText('当前 ID 未在已加载数据中匹配：program_1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '暑期声乐包' })).not.toBeInTheDocument()
    emptyRelationView.unmount()

    const audioView = render(<ResourceView resource="audioMaterials" result={mockResources.audioMaterials} loading={false} onSearch={() => undefined} onSave={(_, payload) => updates.push(payload)} resources={mockResources} />)
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    const file = new File(['audio'], 'lesson.mp3', { type: 'audio/mpeg' })
    await user.upload(screen.getByLabelText('选择音频文件'), file)
    expect(screen.getByText('浏览器端暂存，保存时随表单提交')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(updates).toContainEqual(expect.objectContaining({ audioSource: file }))
    audioView.unmount()
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
