import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RelationActionPayload } from '../../app/sceneWorkspaces'
import { mockResources } from '../../app/mockData'
import { LessonSceneWorkspace } from './LessonSceneWorkspace'
import { ProjectSceneWorkspace } from './ProjectSceneWorkspace'
import { PeopleActionDialog, PeopleRoster, SelectedAvatarGroup } from './SceneComponents'
import { SceneSetupDialog } from './SceneSetupDialog'
import { SceneWorkspaceFocus } from './SceneLocator'

describe('scene workspaces', () => {
  async function enterProjectWorkspace(user: ReturnType<typeof userEvent.setup>, query?: string) {
    expect(screen.getByText('当前项目')).toBeInTheDocument()
    if (!query) {
      return
    }
    await user.click(screen.getByRole('button', { name: '更换项目' }))
    let setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
    await user.click(within(setupDialog).getByRole('button', { name: '下一步：确认项目' }))
    setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
    expect(within(setupDialog).getByText('搜索并确认项目')).toBeInTheDocument()
    if (query) {
      await user.type(within(setupDialog).getByLabelText('项目搜索'), query)
      await user.click(within(setupDialog).getByRole('button', { name: '选择' }))
    }
    await user.click(within(setupDialog).getByRole('button', { name: '进入项目工作台' }))
    expect(screen.getByText('当前项目')).toBeInTheDocument()
  }

  async function enterLessonWorkspace(user: ReturnType<typeof userEvent.setup>, query?: string) {
    expect(screen.getByText('当前课次')).toBeInTheDocument()
    if (!query) {
      return
    }
    await user.click(screen.getByRole('button', { name: '更换课次' }))
    let setupDialog = await screen.findByRole('dialog', { name: '配置课次工作台' })
    await user.click(within(setupDialog).getByRole('button', { name: '下一步：确认课次' }))
    setupDialog = await screen.findByRole('dialog', { name: '配置课次工作台' })
    expect(within(setupDialog).getByText('搜索并确认课次')).toBeInTheDocument()
    if (query) {
      await user.type(within(setupDialog).getByLabelText('课次搜索'), query)
      await user.click(within(setupDialog).getByRole('button', { name: '选择' }))
    }
    await user.click(within(setupDialog).getByRole('button', { name: '进入课次工作台' }))
    expect(screen.getByText('当前课次')).toBeInTheDocument()
  }

  async function completePeopleAction(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    options: {
      searchLabel: string
      search?: string
      chooseName?: string | RegExp
      modeLabel?: string
      mode?: string
    },
  ) {
    if (options.search) {
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

  it('adds project students from locked project context', async () => {
    const user = userEvent.setup()
    const actions: RelationActionPayload[] = []
    render(<ProjectSceneWorkspace resources={mockResources} onCreateRelations={(action) => actions.push(action)} />)

    expect(screen.getByText('项目工作台')).toBeInTheDocument()
    expect(screen.getByText('当前项目')).toBeInTheDocument()
    expect(screen.getAllByText('项目学员').length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: '配置项目工作台' })).not.toBeInTheDocument()
    await enterProjectWorkspace(user)
    await user.click(screen.getByRole('button', { name: '添加项目学员' }))

    const dialog = await screen.findByRole('dialog', { name: '添加项目学员' })
    expect(within(dialog).getByText('锁定项目')).toBeInTheDocument()
    expect(within(dialog).getByText('春季体验课')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('项目')).not.toBeInTheDocument()

    await completePeopleAction(user, dialog, {
      searchLabel: '选择学员搜索',
      search: 'Echo',
      chooseName: '选择陈同学',
      modeLabel: '项目关系状态',
      mode: 'registered',
    })

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
    expect(screen.getByText('当前课次')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '配置课次工作台' })).not.toBeInTheDocument()
    await enterLessonWorkspace(user)
    expect(screen.getByText('教师继承与覆盖')).toBeInTheDocument()
    expect(screen.getByText('项目继承')).toBeInTheDocument()
    expect(screen.getByText('课次实际')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '记录出勤' }))
    const dialog = await screen.findByRole('dialog', { name: '记录课次出勤' })
    expect(within(dialog).getByText('锁定课次')).toBeInTheDocument()
    expect(within(dialog).getByText('体验课第一堂')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('课次')).not.toBeInTheDocument()

    await completePeopleAction(user, dialog, {
      searchLabel: '选择学员搜索',
      search: 'Echo',
      chooseName: '选择陈同学',
      modeLabel: '出勤结果',
      mode: 'present',
    })

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

  it('handles project teacher assignment and empty project scenes', async () => {
    const user = userEvent.setup()
    const actions: RelationActionPayload[] = []
    const { rerender } = render(<ProjectSceneWorkspace resources={mockResources} onCreateRelations={(action) => actions.push(action)} />)

    await enterProjectWorkspace(user, '暑期')
    expect(screen.getByText('这个项目还没有关联学员，从上方添加项目学员开始。')).toBeInTheDocument()
    expect(screen.getByText('这个项目还没有教师分工，从上方分配项目教师开始。')).toBeInTheDocument()
    expect(screen.getByText('暑期第一课')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更换项目' }))
    let setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
    expect(within(setupDialog).getByText('搜索并确认项目')).toBeInTheDocument()
    expect(within(setupDialog).queryByRole('button', { name: '分配项目教师' })).not.toBeInTheDocument()
    await user.click(within(setupDialog).getByRole('button', { name: '进入项目工作台' }))

    await user.click(screen.getByRole('button', { name: '分配项目教师' }))
    const dialog = await screen.findByRole('dialog', { name: '分配项目教师' })
    await completePeopleAction(user, dialog, {
      searchLabel: '选择教师搜索',
      search: '赵老师',
      chooseName: '选择赵老师',
      modeLabel: '项目角色',
      mode: 'assistant',
    })
    expect(actions.at(-1)).toEqual({
      resource: 'programTeachers',
      payloads: [{ programId: 'program_2', teacherId: 'teacher_2', role: 'assistant', status: 'active' }],
    })

    rerender(<ProjectSceneWorkspace resources={{}} onCreateRelations={(action) => actions.push(action)} />)
    expect(screen.getByText('还没有可管理的教学项目')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加项目学员' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开配置弹窗' }))
    setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
    expect(within(setupDialog).getByText('没有匹配的项目')).toBeInTheDocument()
    expect(within(setupDialog).getByRole('button', { name: '进入项目工作台' })).toBeDisabled()
  })

  it('lets operators back out of project target search and select by object row', async () => {
    const user = userEvent.setup()
    render(<ProjectSceneWorkspace resources={mockResources} onCreateRelations={() => undefined} />)

    await user.click(screen.getByRole('button', { name: '更换项目' }))
    let setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
    await user.click(within(setupDialog).getByRole('button', { name: /安排项目老师/ }))
    await user.click(within(setupDialog).getByRole('button', { name: '下一步：确认项目' }))
    setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
    expect(within(setupDialog).getByText('搜索并确认项目')).toBeInTheDocument()
    expect(within(setupDialog).getByText('安排项目老师')).toBeInTheDocument()
    await user.type(within(setupDialog).getByLabelText('项目搜索'), '没有这个项目')
    expect(within(setupDialog).getByText('没有匹配的项目')).toBeInTheDocument()
    await user.click(within(setupDialog).getByRole('button', { name: '上一步' }))
    expect(within(setupDialog).getByText('你现在要处理哪类项目任务？')).toBeInTheDocument()

    await user.click(within(setupDialog).getByRole('button', { name: '下一步：确认项目' }))
    setupDialog = await screen.findByRole('dialog', { name: '配置项目工作台' })
    await user.type(within(setupDialog).getByLabelText('项目搜索'), '暑期')
    await user.click(within(setupDialog).getByRole('button', { name: /暑期声乐包/ }))
    await user.click(within(setupDialog).getByRole('button', { name: '进入项目工作台' }))
    expect(screen.getByText('当前任务')).toBeInTheDocument()
    expect(screen.getAllByText('暑期声乐包').length).toBeGreaterThan(0)
  })

  it('shows human context for project and lesson object rows', async () => {
    const user = userEvent.setup()
    const onProjectPendingChange = vi.fn()
    const onLessonPendingChange = vi.fn()
    const projectPicker = render(
      <SceneSetupDialog
        open
        title="配置项目工作台"
        description="确认项目上下文"
        intentTitle="选择任务"
        intentDescription="选择项目任务"
        targetTitle="搜索并确认项目"
        targetDescription="确认项目上下文"
        objectLabel="项目"
        tasks={[{ key: 'students', title: '管理项目学员', description: '加入项目学员' }]}
        selectedTask="students"
        objects={[
          { id: 'project_custom_1', type: 'trial', status: 'active', plannedStartAt: '2026-07-01' },
          { id: 'project_custom_2', title: '未定项目', type: 'course_package', status: 'draft' },
        ]}
        pendingId="project_custom_1"
        kind="project"
        onTaskChange={() => undefined}
        onPendingChange={onProjectPendingChange}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    let setupDialog = screen.getByRole('dialog', { name: '配置项目工作台' })
    await user.click(within(setupDialog).getByRole('button', { name: '下一步：确认项目' }))
    setupDialog = screen.getByRole('dialog', { name: '配置项目工作台' })
    expect(screen.getAllByText('project_custom_1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('体验课 · 课次数待定').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2026-07-01').length).toBeGreaterThan(0)
    await user.click(within(setupDialog).getByRole('button', { name: /未定项目/ }))
    expect(onProjectPendingChange).toHaveBeenCalledWith('project_custom_2')
    projectPicker.unmount()

    render(
      <SceneSetupDialog
        open
        title="配置课次工作台"
        description="确认课次上下文"
        intentTitle="选择任务"
        intentDescription="选择课次任务"
        targetTitle="搜索并确认课次"
        targetDescription="确认课次上下文"
        objectLabel="课次"
        tasks={[{ key: 'attendance', title: '记录本堂出勤', description: '确认出勤' }]}
        selectedTask="attendance"
        objects={[{ id: 'lesson_custom_1', title: '周末课', status: 'planned', location: '一号教室', startTime: '09:00', endTime: '10:00' }]}
        pendingId="lesson_custom_1"
        kind="lesson"
        onTaskChange={() => undefined}
        onPendingChange={onLessonPendingChange}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    setupDialog = screen.getByRole('dialog', { name: '配置课次工作台' })
    await user.click(within(setupDialog).getByRole('button', { name: '下一步：确认课次' }))
    expect(screen.getAllByText('主题待定 · 一号教室').length).toBeGreaterThan(0)
    expect(screen.getAllByText('09:00 - 10:00').length).toBeGreaterThan(0)
    render(<SceneWorkspaceFocus objectLabel="课次" onChangeContext={() => undefined} />)
    expect(screen.getByText('处理场景任务')).toBeInTheDocument()
  })

  it('handles lesson teacher confirmation, inherited-only state, and empty lesson scenes', async () => {
    const user = userEvent.setup()
    const actions: RelationActionPayload[] = []
    const { rerender } = render(<LessonSceneWorkspace resources={mockResources} onCreateRelations={(action) => actions.push(action)} />)

    await user.click(screen.getByRole('button', { name: '更换课次' }))
    let setupDialog = await screen.findByRole('dialog', { name: '配置课次工作台' })
    await user.click(within(setupDialog).getByRole('button', { name: /确认实际老师/ }))
    await enterLessonWorkspace(user, '暑期')
    expect(screen.getByText('继承中')).toBeInTheDocument()
    expect(screen.getByText('这堂课还没有学员出勤记录，从上方记录出勤开始。')).toBeInTheDocument()
    expect(screen.getByText('尚未覆盖，默认参考项目教师')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更换课次' }))
    setupDialog = await screen.findByRole('dialog', { name: '配置课次工作台' })
    expect(within(setupDialog).getByText('搜索并确认课次')).toBeInTheDocument()
    expect(within(setupDialog).queryByRole('button', { name: '确认课次教师' })).not.toBeInTheDocument()
    await user.click(within(setupDialog).getByRole('button', { name: '进入课次工作台' }))

    await user.click(screen.getByRole('button', { name: '确认课次教师' }))
    const dialog = await screen.findByRole('dialog', { name: '确认课次教师' })
    await completePeopleAction(user, dialog, {
      searchLabel: '选择教师搜索',
      search: '林老师',
      chooseName: '选择林老师',
      modeLabel: '课次角色',
      mode: 'evaluator',
    })
    expect(actions.at(-1)).toEqual({
      resource: 'sessionTeachers',
      payloads: [{ sessionId: 'session_2', teacherId: 'admin_1', role: 'evaluator', status: 'active' }],
    })

    rerender(<LessonSceneWorkspace resources={{}} onCreateRelations={(action) => actions.push(action)} />)
    expect(screen.getByText('还没有可处理的课次')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '记录出勤' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开配置弹窗' }))
    setupDialog = await screen.findByRole('dialog', { name: '配置课次工作台' })
    expect(within(setupDialog).getByText('没有匹配的课次')).toBeInTheDocument()
    expect(within(setupDialog).getByRole('button', { name: '进入课次工作台' })).toBeDisabled()
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
    await user.type(within(dialog).getByLabelText('选择学员搜索'), '没有这个人')
    expect(within(dialog).getByText('没有匹配的人物')).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('选择学员搜索'))
    await user.click(within(dialog).getByRole('button', { name: '选择学员1' }))
    expect(within(dialog).getAllByText('还没有选择人物').length).toBeGreaterThan(0)
    expect(within(dialog).getByRole('button', { name: '保存中' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: '选择学员1' }))
    expect(within(dialog).getByText('本次保存')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '保存中' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(actions).toEqual([{ resource: 'programStudents', payloads: [] }])
  })

})
