import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RelationActionPayload } from '../../app/sceneWorkspaces'
import { mockResources } from '../../app/mockData'
import { DocumentEditorModal } from './DocumentEditorModal'
import { LessonSceneWorkspace } from './LessonSceneWorkspace'
import { ProjectSceneWorkspace } from './ProjectSceneWorkspace'
import { PeopleActionDialog, PeopleRoster, SelectedAvatarGroup } from './SceneComponents'

describe('scene workspaces', () => {
  it('adds project students from locked project context', async () => {
    const user = userEvent.setup()
    const actions: RelationActionPayload[] = []
    render(<ProjectSceneWorkspace resources={mockResources} onCreateRelations={(action) => actions.push(action)} />)

    expect(screen.getByText('项目工作台')).toBeInTheDocument()
    expect(screen.getByText('当前项目')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '添加项目学员' }))

    const dialog = await screen.findByRole('dialog', { name: '添加项目学员' })
    expect(within(dialog).getByText('锁定项目')).toBeInTheDocument()
    expect(within(dialog).getByText('春季体验课')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('项目')).not.toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('选择学员搜索'), 'Echo')
    await user.click(within(dialog).getByRole('button', { name: '选择陈同学' }))
    await user.selectOptions(within(dialog).getByLabelText('项目关系状态'), 'registered')
    await user.click(within(dialog).getByRole('button', { name: '保存关系' }))

    expect(actions).toEqual([
      {
        resource: 'programStudents',
        payloads: expect.arrayContaining([
          { programId: 'program_1', studentId: 'student_1', status: 'registered' },
          { programId: 'program_1', studentId: 'student_3', status: 'registered' },
        ]),
      },
    ])
  })

  it('records lesson attendance from locked lesson context and shows teacher inheritance', async () => {
    const user = userEvent.setup()
    const actions: RelationActionPayload[] = []
    render(<LessonSceneWorkspace resources={mockResources} onCreateRelations={(action) => actions.push(action)} />)

    expect(screen.getByText('课次工作台')).toBeInTheDocument()
    expect(screen.getByText('教师继承与覆盖')).toBeInTheDocument()
    expect(screen.getByText('项目继承')).toBeInTheDocument()
    expect(screen.getByText('课次实际')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '记录出勤' }))
    const dialog = await screen.findByRole('dialog', { name: '记录课次出勤' })
    expect(within(dialog).getByText('锁定课次')).toBeInTheDocument()
    expect(within(dialog).getByText('体验课第一堂')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('课次')).not.toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('选择学员搜索'), 'Echo')
    await user.click(within(dialog).getByRole('button', { name: '选择陈同学' }))
    await user.selectOptions(within(dialog).getByLabelText('出勤结果'), 'present')
    await user.click(within(dialog).getByRole('button', { name: '保存关系' }))

    expect(actions).toEqual([
      {
        resource: 'sessionStudents',
        payloads: expect.arrayContaining([
          { sessionId: 'session_1', studentId: 'student_1', status: 'present' },
          { sessionId: 'session_1', studentId: 'student_2', status: 'present' },
          { sessionId: 'session_1', studentId: 'student_3', status: 'present' },
        ]),
      },
    ])
  })

  it('switches document editor modes and saves draft content', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <DocumentEditorModal
        open
        title="编辑说明"
        label="说明"
        value="<p>原始内容</p>"
        onClose={() => undefined}
        onSave={onSave}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '编辑说明' })
    expect(within(dialog).getByRole('tab', { name: '主编辑模式' })).toHaveAttribute('data-state', 'active')
    await user.click(within(dialog).getByRole('tab', { name: '主预览模式' }))
    expect(within(dialog).getByText('原始内容')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('tab', { name: '主分屏模式' }))
    expect(within(dialog).getAllByText('原始内容').length).toBeGreaterThan(0)
    await user.click(within(dialog).getByRole('tab', { name: '主 Markdown 模式' }))
    const markdown = within(dialog).getByLabelText('说明 Markdown编辑')
    await user.clear(markdown)
    await user.type(markdown, '## 新标题')
    await user.click(within(dialog).getByRole('tab', { name: '主 HTML 模式' }))
    expect(within(dialog).getByLabelText('说明 HTML编辑')).toHaveValue('<h2>新标题</h2>\n')
    await user.click(within(dialog).getByRole('button', { name: '保存内容' }))

    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('<h2'))
  })

  it('handles project teacher assignment and empty project scenes', async () => {
    const user = userEvent.setup()
    const actions: RelationActionPayload[] = []
    const { rerender } = render(<ProjectSceneWorkspace resources={mockResources} onCreateRelations={(action) => actions.push(action)} />)

    await user.selectOptions(screen.getByLabelText('选择项目'), 'program_2')
    expect(screen.getByText('这个项目还没有关联学员，从上方添加项目学员开始。')).toBeInTheDocument()
    expect(screen.getByText('这个项目还没有教师分工，从上方分配项目教师开始。')).toBeInTheDocument()
    expect(screen.getByText('暑期第一课')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '分配项目教师' }))
    const dialog = await screen.findByRole('dialog', { name: '分配项目教师' })
    await user.type(within(dialog).getByLabelText('选择教师搜索'), '赵老师')
    await user.click(within(dialog).getByRole('button', { name: '选择赵老师' }))
    await user.selectOptions(within(dialog).getByLabelText('项目角色'), 'assistant')
    await user.click(within(dialog).getByRole('button', { name: '保存关系' }))
    expect(actions.at(-1)).toEqual({
      resource: 'programTeachers',
      payloads: [{ programId: 'program_2', teacherId: 'teacher_2', role: 'assistant', status: 'active' }],
    })

    rerender(<ProjectSceneWorkspace resources={{}} onCreateRelations={(action) => actions.push(action)} />)
    expect(screen.getByText('暂无项目')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加项目学员' })).toBeDisabled()
    expect(screen.getByText('这个项目还没有课次')).toBeInTheDocument()
  })

  it('handles lesson teacher confirmation, inherited-only state, and empty lesson scenes', async () => {
    const user = userEvent.setup()
    const actions: RelationActionPayload[] = []
    const { rerender } = render(<LessonSceneWorkspace resources={mockResources} onCreateRelations={(action) => actions.push(action)} />)

    await user.selectOptions(screen.getByLabelText('选择课次'), 'session_2')
    expect(screen.getByText('继承中')).toBeInTheDocument()
    expect(screen.getByText('这堂课还没有学员出勤记录，从上方记录出勤开始。')).toBeInTheDocument()
    expect(screen.getByText('尚未覆盖，默认参考项目教师')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认课次教师' }))
    const dialog = await screen.findByRole('dialog', { name: '确认课次教师' })
    await user.type(within(dialog).getByLabelText('选择教师搜索'), '林老师')
    await user.click(within(dialog).getByRole('button', { name: '选择林老师' }))
    await user.selectOptions(within(dialog).getByLabelText('课次角色'), 'evaluator')
    await user.click(within(dialog).getByRole('button', { name: '保存关系' }))
    expect(actions.at(-1)).toEqual({
      resource: 'sessionTeachers',
      payloads: [{ sessionId: 'session_2', teacherId: 'admin_1', role: 'evaluator', status: 'active' }],
    })

    rerender(<LessonSceneWorkspace resources={{}} onCreateRelations={(action) => actions.push(action)} />)
    expect(screen.getByText('暂无课次')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '记录出勤' })).toBeDisabled()
    expect(screen.getByText('项目还没有教师分工')).toBeInTheDocument()
  })

  it('protects document drafts and handles image upload states', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSave = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true)
    const image = new File(['image'], 'note.png', { type: 'image/png' })
    const { rerender } = render(
      <DocumentEditorModal
        open
        title="编辑说明"
        label="说明"
        value="<p>原始内容</p>"
        onClose={onClose}
        onSave={onSave}
      />,
    )

    let dialog = screen.getByRole('dialog', { name: '编辑说明' })
    await user.click(within(dialog).getByRole('tab', { name: '主 Markdown 模式' }))
    await user.clear(within(dialog).getByLabelText('说明 Markdown编辑'))
    await user.type(within(dialog).getByLabelText('说明 Markdown编辑'), '草稿')
    await user.click(within(dialog).getByRole('button', { name: '关闭' }))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <DocumentEditorModal
        open
        title="编辑说明"
        label="说明"
        value=""
        onClose={() => undefined}
        onSave={onSave}
      />,
    )
    dialog = screen.getByRole('dialog', { name: '编辑说明' })
    await user.upload(within(dialog).getByLabelText('说明插入图片'), image)
    expect(within(dialog).getByText('未配置图片上传接口')).toBeInTheDocument()

    rerender(
      <DocumentEditorModal
        open
        title="编辑说明"
        label="说明"
        value=""
        onClose={() => undefined}
        onSave={onSave}
        onUploadImage={async (file) => `https://kyoss.abcmem.com/${file.name}`}
      />,
    )
    dialog = screen.getByRole('dialog', { name: '编辑说明' })
    await user.upload(within(dialog).getByLabelText('说明插入图片'), image)
    await waitFor(() => expect(within(dialog).getByText(/图片会先进入编辑草稿/)).toBeInTheDocument())
    await user.click(within(dialog).getByRole('button', { name: '保存内容' }))
    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('https://kyoss.abcmem.com/note.png'))

    confirm.mockRestore()
  })

  it('handles direct people dialog edge states and selected avatar overflow', async () => {
    const user = userEvent.setup()
    const actions: RelationActionPayload[] = []
    const people = Array.from({ length: 7 }).map((_, index) => ({
      id: `person_${index + 1}`,
      kind: 'student' as const,
      name: `学员${index + 1}`,
      secondary: `1390000000${index}`,
      avatar: index === 0 ? 'https://kyoss.abcmem.com/avatar.png' : undefined,
      status: index === 1 ? '' : '可用',
      relationStatus: index === 0 ? '学习中' : undefined,
      selected: index === 0,
      sourceRecord: { id: `person_${index + 1}` },
    }))

    const hidden = render(
      <PeopleActionDialog
        open={false}
        title="隐藏人物"
        description="不可见"
        context={null}
        contextLabel="锁定项目"
        people={people}
        optionLabel="选择学员"
        modeLabel="状态"
        modeOptions={[{ value: 'active', label: '学习中' }]}
        defaultMode="active"
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    expect(screen.queryByText('隐藏人物')).not.toBeInTheDocument()
    hidden.unmount()

    render(<SelectedAvatarGroup people={people} />)
    expect(screen.getByText('+2')).toBeInTheDocument()

    const roster = render(<PeopleRoster title="已选学员" people={people.slice(1, 3)} emptyLabel="暂无学员" />)
    expect(screen.getByText('暂无学员')).toBeInTheDocument()
    roster.unmount()

    render(
      <PeopleActionDialog
        open
        title="选择人物"
        description="测试人物选择"
        context={null}
        contextLabel="锁定项目"
        people={people}
        optionLabel="选择学员"
        modeLabel="状态"
        modeOptions={[{ value: 'active', label: '学习中' }]}
        defaultMode="active"
        submitting
        onClose={() => actions.push({ resource: 'programStudents', payloads: [] })}
        onSubmit={(selectedIds, mode) => actions.push({ resource: 'programStudents', payloads: [{ selectedIds, mode }] })}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '选择人物' })
    expect(within(dialog).getByRole('button', { name: '保存中' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('选择学员搜索'), '没有这个人')
    expect(within(dialog).getByText('没有匹配的人物')).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('选择学员搜索'))
    await user.click(within(dialog).getByRole('button', { name: '选择学员1' }))
    expect(within(dialog).getByText('还没有选择人物')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(actions).toEqual([{ resource: 'programStudents', payloads: [] }])
  })

  it('previews empty documents and uploads from html mode', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const image = new File(['image'], 'html.png', { type: 'image/png' })
    render(
      <DocumentEditorModal
        open
        title="编辑空文档"
        label="说明"
        value=""
        onClose={() => undefined}
        onSave={onSave}
        onUploadImage={async (file) => `https://kyoss.abcmem.com/${file.name}`}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '编辑空文档' })
    await user.click(within(dialog).getByRole('tab', { name: '主预览模式' }))
    expect(within(dialog).getByText('暂无内容')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('tab', { name: '主 HTML 模式' }))
    await user.type(within(dialog).getByLabelText('说明 HTML编辑'), '<p>HTML</p>')
    await user.upload(within(dialog).getByLabelText('说明插入图片'), image)
    await waitFor(() => expect((within(dialog).getByLabelText('说明 HTML编辑') as HTMLTextAreaElement).value).toContain('html.png'))
    await user.click(within(dialog).getByRole('button', { name: '保存内容' }))
    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('html.png'))
  })
})
