import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../../App'
import { createMockOpsApi, type OpsApi } from '../../app/api'
import { mockSharePreview } from '../../app/mockData'
import { buildResourceFormState, buildResourcePayload, nextPublishStatus } from '../../app/resourceForms'
import { LoginView } from './LoginView'
import { ResourceForm } from './ResourceForm'

describe('ops admin edge coverage', () => {
  it('saves edited resources and publishes draft resources through the app shell', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.click(await screen.findByRole('button', { name: '活动' }))
    await user.click((await screen.findAllByRole('button', { name: '编辑' }))[0])
    await user.clear(screen.getByLabelText('标题'))
    await user.type(screen.getByLabelText('标题'), '编辑后的公开课')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('已保存记录')).toBeInTheDocument()
    expect(await screen.findByText('编辑后的公开课')).toBeInTheDocument()

    await user.click((await screen.findAllByRole('button', { name: '发布' }))[0])
    expect(await screen.findByText('已发布')).toBeInTheDocument()
  })

  it('uses fallback text for non-Error resource failures', async () => {
    const user = userEvent.setup()
    const api: OpsApi = {
      ...createMockOpsApi(),
      createResource: async () => {
        throw 'plain create failure'
      },
      updateResource: async () => {
        throw 'plain update failure'
      },
    }
    render(<App api={api} />)

    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.click(await screen.findByRole('button', { name: '活动' }))
    await user.click(await screen.findByRole('button', { name: '新建活动' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存失败')).toBeInTheDocument()

    await user.click((await screen.findAllByRole('button', { name: '发布' }))[0])
    expect(await screen.findByText('发布失败')).toBeInTheDocument()
  })

  it('covers login, resource form, and resource helper fallback branches', async () => {
    const user = userEvent.setup()
    const errors: string[] = []
    render(
      <LoginView
        api={{
          ...createMockOpsApi(),
          login: async () => {
            throw new Error('bad login')
          },
        }}
        loading={false}
        onSuccess={() => undefined}
        onError={(message) => errors.push(message)}
      />,
    )

    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(errors).toContain('bad login')

    expect(buildResourceFormState('auditLogs')).toEqual({})
    expect(buildResourcePayload('auditLogs', { action: 'ignored' })).toEqual({})
    expect(nextPublishStatus('videoMaterials', 'draft')).toBe('published')
  })

  it('renders resource forms for empty and textarea-backed resources', async () => {
    const user = userEvent.setup()
    const submitted: Array<Record<string, unknown>> = []
    const emptyForm = render(<ResourceForm resource="auditLogs" onSubmit={(payload) => submitted.push(payload)} />)
    expect(emptyForm.container).toBeEmptyDOMElement()
    emptyForm.unmount()

    render(
      <ResourceForm
        resource="activitySignups"
        record={{ id: 'signup_1', realName: '旧姓名', status: 'registered', remark: null }}
        onSubmit={(payload) => submitted.push(payload)}
      />,
    )

    await user.clear(screen.getByLabelText('姓名'))
    await user.type(screen.getByLabelText('姓名'), '新姓名')
    await user.type(screen.getByLabelText('备注'), '已电话确认')
    await user.selectOptions(screen.getByLabelText('状态'), 'attended')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(submitted).toContainEqual({ realName: '新姓名', status: 'attended', remark: '已电话确认' })
  })

  it('covers mock API assessment and share fallback branches', async () => {
    const api = createMockOpsApi()
    await expect(api.viewShare('missing-token')).resolves.toMatchObject({ title: mockSharePreview.title })

    const draft = await api.createAssessment('token', { templateId: 'missing_template', studentId: 'student_1' })
    expect(draft.answersJson).toEqual({})
    await expect(api.saveAssessment('token', draft.id, {})).resolves.toMatchObject({ answersJson: {} })
    const submitted = await api.submitAssessment('token', draft.id)
    const report = await api.getReport('token', submitted.report.id)
    expect(report.title).toBe('评估报告')

    const share = await api.createShareLink('token', submitted.report.id)
    await expect(api.viewShare(share.token)).resolves.toMatchObject({ title: mockSharePreview.title })
  })
})
