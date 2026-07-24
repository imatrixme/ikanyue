import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../../App'
import { createMockOpsApi } from '../../app/api'
import { mockProfiles } from '../../app/mockData'

describe('admin course operations', () => {
  it('routes through catalog, automatic enrollment, and class workflows', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)
    await login(user)

    await open(user, '课程规格', '课程规格')
    expect(screen.getByRole('table')).toHaveTextContent('综合声乐班')
    await user.click(screen.getByRole('button', { name: '新增课程规格' }))
    const courseDialog = screen.getByRole('dialog', { name: '新增课程规格' })
    await user.type(within(courseDialog).getByLabelText('课程名称'), '精品一对一声乐')
    await user.type(within(courseDialog).getByLabelText('课程编码'), 'VOCAL-ONE')
    await user.selectOptions(within(courseDialog).getByLabelText('授课形式'), 'one_to_one')
    await user.type(within(courseDialog).getByLabelText('教师等级'), 'senior')
    await user.type(within(courseDialog).getByLabelText('默认课时类型编号'), 'credit_one')
    await user.click(within(courseDialog).getByRole('button', { name: '保存' }))
    expect((await screen.findAllByText('精品一对一声乐')).length).toBeGreaterThan(0)

    await open(user, '课包与价格', '课包管理')
    await user.click(screen.getByRole('tab', { name: '价格版本' }))
    expect(await screen.findByRole('heading', { name: '价格版本' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '发放规则' }))
    expect(await screen.findByRole('heading', { name: '课时发放规则' })).toBeInTheDocument()

    await open(user, '报课管理', '报课管理')
    await user.click(screen.getByRole('button', { name: '新建报课' }))
    const enrollmentDialog = screen.getByRole('dialog', { name: '管理员报课' })
    await user.selectOptions(within(enrollmentDialog).getByLabelText('学员'), 'student_1')
    await user.selectOptions(within(enrollmentDialog).getByLabelText('课包'), 'package_1')
    await user.selectOptions(within(enrollmentDialog).getByLabelText('价格版本'), 'price_1')
    await user.selectOptions(within(enrollmentDialog).getByLabelText('班级（可选）'), 'class_1')
    await user.click(within(enrollmentDialog).getByRole('button', { name: '确认报课' }))
    await waitFor(() => expect(screen.getAllByText(/ENR-enrollment_/).length).toBeGreaterThan(0))

    await user.click(screen.getAllByRole('button', { name: '同步名单' })[0])
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '确认同步' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '确认同步课堂名单' })).not.toBeInTheDocument())

    await open(user, '班级管理', '班级管理')
    await user.click(screen.getAllByRole('button', { name: '班级详情' })[0])
    const classDrawer = await screen.findByRole('dialog', { name: '周六综合声乐班' })
    expect(classDrawer).toHaveTextContent('班级成员')
    await user.type(within(classDrawer).getByLabelText('教师编号'), 'teacher_2')
    await user.click(within(classDrawer).getByRole('button', { name: '分配' }))
    await waitFor(() => expect(classDrawer).toHaveTextContent('teacher_2'))
    await user.click(within(classDrawer).getByRole('button', { name: '为班级报课' }))
    expect(await screen.findByRole('dialog', { name: '管理员报课' })).toBeInTheDocument()
  })

  it('handles lesson attendance, settlement, student detail, and read-only control views', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)
    await login(user)

    await open(user, '课堂管理', '课堂管理')
    await user.click((await screen.findAllByRole('button', { name: '课堂详情' }))[0])
    let lessonDrawer = await screen.findByRole('dialog', { name: '合唱排练' })
    await user.click(within(lessonDrawer).getByRole('button', { name: '全部到课' }))
    await waitFor(() => expect(within(lessonDrawer).getByLabelText('学员student_1出勤')).toHaveValue('present'))
    await user.selectOptions(within(lessonDrawer).getByLabelText('教师teacher_1实际状态'), 'confirmed')
    await user.click(within(lessonDrawer).getByRole('button', { name: '结束课堂' }))
    expect(screen.getByRole('dialog', { name: '确认结束课堂' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认结束' }))
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('completed'))

    await user.click(screen.getAllByRole('button', { name: '课堂详情' })[0])
    lessonDrawer = await screen.findByRole('dialog', { name: '合唱排练' })
    await user.click(within(lessonDrawer).getByRole('button', { name: '核销预览' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '进入确认' }))
    expect(screen.getByRole('dialog', { name: '确认课堂核销' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认核销' }))
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('settled'))

    await user.click(screen.getAllByRole('button', { name: '课堂详情' })[0])
    lessonDrawer = await screen.findByRole('dialog', { name: '合唱排练' })
    await user.click(within(lessonDrawer).getByRole('button', { name: '核销更正' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '确认更正' }))
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('correction_pending'))

    await open(user, '课时账户', '课时账户')
    await user.click(screen.getAllByRole('button', { name: '查看课时账户明细' })[0])
    expect(await screen.findByRole('dialog', { name: '课时账户明细' })).toHaveTextContent('来源批次')
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    await open(user, '教师工作量', '教师工作量')
    expect(screen.getByRole('table')).toHaveTextContent('teacher_1')
    await open(user, '异常中心', '核销异常')
    await user.click(screen.getByRole('tab', { name: '对账异常' }))
    expect(await screen.findByRole('heading', { name: '对账异常' })).toBeInTheDocument()
    await open(user, '操作审计', '操作审计')
    expect(screen.getByRole('table')).toHaveTextContent('course_operations.enrollment.create')

    await open(user, '学员管理', '学员管理')
    await user.click(screen.getAllByRole('button', { name: '查看张同学课程与班级' })[0])
    const studentDrawer = await screen.findByRole('dialog', { name: '张同学 · 课程与班级' })
    expect(studentDrawer).toHaveTextContent('可用课时')
    expect(studentDrawer).toHaveTextContent('报课记录')
    await user.click(within(studentDrawer).getByRole('button', { name: '为此学员报课' }))
    expect(await screen.findByRole('dialog', { name: '管理员报课' })).toBeInTheDocument()
  })

  it('denies an unauthorized routed view while retaining teacher course navigation', async () => {
    window.history.replaceState({}, '', '/points')
    localStorage.setItem('kanyue.points-lite.session', JSON.stringify({ token: 'teacher-token', profile: mockProfiles.teacher }))
    render(<App api={createMockOpsApi()} />)
    expect(await screen.findByRole('heading', { name: '当前账号无权访问' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '课堂管理' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '学员积分' })).not.toBeInTheDocument()
  })

  it('keeps teacher-only work inside assigned students and lessons', async () => {
    const user = userEvent.setup()
    const teacherOnly = { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.teacher' as const] }
    window.history.replaceState({}, '', '/students')
    localStorage.setItem('kanyue.points-lite.session', JSON.stringify({ token: 'teacher-token', profile: teacherOnly }))
    render(<App api={createMockOpsApi()} />)

    expect(await screen.findByRole('heading', { name: '我的学员' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('张同学')
    expect(screen.getByRole('table')).not.toHaveTextContent('李同学')
    expect(screen.queryByRole('button', { name: '新增学员' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑张同学' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '查看张同学课程与班级' }))
    const studentDrawer = await screen.findByRole('dialog', { name: '张同学 · 授课关系' })
    expect(studentDrawer).toHaveTextContent('关联班级')
    expect(studentDrawer).not.toHaveTextContent('积分')
    expect(within(studentDrawer).queryByRole('button', { name: '为此学员报课' })).not.toBeInTheDocument()
    await user.click(within(studentDrawer).getByRole('button', { name: '关闭弹窗' }))

    await open(user, '课堂管理', '我的课堂')
    expect(screen.queryByRole('button', { name: '新增课堂' })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '课堂详情' })[0])
    const lessonDrawer = await screen.findByRole('dialog', { name: '合唱排练' })
    expect(within(lessonDrawer).getByRole('button', { name: '全部到课' })).toBeInTheDocument()
    expect(within(lessonDrawer).queryByRole('button', { name: '核销预览' })).not.toBeInTheDocument()
    expect(within(lessonDrawer).queryByRole('button', { name: '调整时间' })).not.toBeInTheDocument()
    await user.selectOptions(within(lessonDrawer).getByLabelText('教师teacher_1实际状态'), 'confirmed')
    await waitFor(() => expect(within(lessonDrawer).getByLabelText('教师teacher_1实际状态')).toHaveValue('confirmed'))
    expect(screen.queryByRole('button', { name: '报课管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '课时账户' })).not.toBeInTheDocument()
  })

  it('keeps settlement-only work read-only until a completed lesson is ready to settle', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    await api.setCourseResourceStatus('token', 'lessons', 'lesson_1', 'completed')
    const settlementOnly = { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.settlement' as const] }
    window.history.replaceState({}, '', '/lessons')
    localStorage.setItem('kanyue.points-lite.session', JSON.stringify({ token: 'settlement-token', profile: settlementOnly }))
    render(<App api={api} />)

    expect(await screen.findByRole('heading', { name: '课堂核销' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新增课堂' })).not.toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: '课堂详情' }))[0])
    const lessonDrawer = await screen.findByRole('dialog', { name: '合唱排练' })
    expect(within(lessonDrawer).queryByRole('button', { name: '全部到课' })).not.toBeInTheDocument()
    expect(within(lessonDrawer).queryByRole('button', { name: '调整时间' })).not.toBeInTheDocument()
    expect(within(lessonDrawer).queryByRole('button', { name: '取消课堂' })).not.toBeInTheDocument()
    expect(within(lessonDrawer).getByRole('button', { name: '核销预览' })).toBeInTheDocument()
    expect(within(lessonDrawer).getByLabelText('学员student_1出勤')).toBeDisabled()
    expect(within(lessonDrawer).getByLabelText('教师teacher_1实际状态')).toBeDisabled()
  })
})

async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('账号或手机号'), 'admin')
  await user.type(screen.getByLabelText('密码'), 'secret')
  await user.click(screen.getByRole('button', { name: /^登录$/ }))
  await screen.findByRole('heading', { name: '今日工作台' })
}

async function open(user: ReturnType<typeof userEvent.setup>, navigation: string, heading: string) {
  await user.click(screen.getByRole('button', { name: navigation }))
  await screen.findByRole('heading', { name: heading })
}
