import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { GuidedAnswers, GuidedPlan } from '../../app/guidedWorkflows'
import { mockResources } from '../../app/mockData'
import { GuidedOpsWorkspace } from './GuidedOpsWorkspace'

describe('guided ops workspace', () => {
  it('opens a scenario-first guided dialog and preserves answers across steps', async () => {
    const user = userEvent.setup()
    const submissions: Array<{ plan: GuidedPlan; answers: GuidedAnswers }> = []
    render(<GuidedOpsWorkspace resources={mockResources} onSubmitPlan={(plan, answers) => submissions.push({ plan, answers })} />)

    expect(screen.getByText('运营流程工作台')).toBeInTheDocument()
    expect(screen.queryByText('每次创建都回答 7 个问题')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '报名与转化' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '教务排课' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '内容与投放' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '测评与报告' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /发布音频素材/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /内容与投放/ }))
    expect(screen.getByRole('button', { name: /发布音频素材/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /配置运营位/ })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /报名与转化/ }))
    expect(screen.getByText('报名中心')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /发布可报名活动/ }))
    const dialog = await screen.findByRole('dialog', { name: '发布可报名活动' })
    expect(within(dialog).getByRole('button', { name: /活动目的/ })).toHaveAttribute('aria-current', 'step')

    await user.clear(within(dialog).getByLabelText('活动标题'))
    await user.type(within(dialog).getByLabelText('活动标题'), '夏季公开体验课')
    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    await user.clear(within(dialog).getByLabelText('名额'))
    await user.type(within(dialog).getByLabelText('名额'), '18')

    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    await user.clear(within(dialog).getByLabelText('开始时间时间'))
    await user.type(within(dialog).getByLabelText('开始时间时间'), '09:00')
    await user.clear(within(dialog).getByLabelText('结束时间时间'))
    await user.type(within(dialog).getByLabelText('结束时间时间'), '10:30')

    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    await user.clear(within(dialog).getByLabelText('地点'))
    await user.type(within(dialog).getByLabelText('地点'), '静安校区 A 教室')

    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    await user.click(within(dialog).getByLabelText(/王老师/))
    await user.type(within(dialog).getByLabelText('运营负责人'), '林老师')

    await user.click(within(dialog).getByRole('button', { name: '上一步' }))
    expect(within(dialog).getByLabelText('地点')).toHaveValue('静安校区 A 教室')
    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    await user.click(within(dialog).getByRole('button', { name: '下一步' }))

    expect(within(dialog).getByText(/将生成/)).toBeInTheDocument()
    expect(within(dialog).getAllByText('数据对象').length).toBeGreaterThan(0)
    expect(within(dialog).queryByText(/"targetId"/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '确认创建' }))

    expect(submissions).toHaveLength(1)
    expect(submissions[0].answers.title).toBe('夏季公开体验课')
    expect(submissions[0].plan.facts.find((fact) => fact.key === 'place')?.value).toBe('静安校区 A 教室')
    expect(submissions[0].plan.operations.map((operation) => operation.resource)).toEqual(expect.arrayContaining(['activities', 'operationSlots']))
  })

  it('saves, resumes, and deletes guided workflow drafts', async () => {
    const user = userEvent.setup()
    render(<GuidedOpsWorkspace resources={mockResources} onSubmitPlan={() => undefined} />)

    expect(screen.getByText('暂无流程草稿')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '教务排课' }))
    await user.click(screen.getByRole('button', { name: /安排体验课/ }))
    const dialog = await screen.findByRole('dialog', { name: '安排体验课' })
    await user.clear(within(dialog).getByLabelText('体验课名称'))
    await user.type(within(dialog).getByLabelText('体验课名称'), '草稿体验课')
    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    await user.click(within(dialog).getByRole('button', { name: '保存草稿' }))
    await user.click(within(dialog).getByRole('button', { name: '关闭' }))

    expect(screen.getByText('草稿体验课')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续编辑' }))
    const resumed = await screen.findByRole('dialog', { name: '安排体验课' })
    expect(within(resumed).getByRole('button', { name: /体验学员/ })).toHaveAttribute('aria-current', 'step')
    await user.click(within(resumed).getByRole('button', { name: /体验目的.*体验课/ }))
    expect(within(resumed).getByLabelText('体验课名称')).toHaveValue('草稿体验课')
    await user.click(within(resumed).getByRole('button', { name: '关闭' }))
    await user.click(screen.getByRole('button', { name: /删除草稿草稿体验课/ }))
    expect(screen.queryByText('草稿体验课')).not.toBeInTheDocument()
  })

  it('marks pending facts deliberately and shows generated plan warnings', async () => {
    const user = userEvent.setup()
    const submissions: GuidedPlan[] = []
    render(<GuidedOpsWorkspace resources={mockResources} onSubmitPlan={(plan) => submissions.push(plan)} />)

    await user.click(screen.getByRole('tab', { name: '教务排课' }))
    await user.click(screen.getByRole('button', { name: /安排体验课/ }))
    const dialog = await screen.findByRole('dialog', { name: '安排体验课' })
    await user.click(within(dialog).getByRole('button', { name: /时间.*体验课什么时候上/ }))
    await user.click(within(dialog).getByRole('switch', { name: '时间待排' }))
    await user.click(within(dialog).getByRole('button', { name: /老师.*谁来上这节体验课/ }))
    await user.click(within(dialog).getByRole('switch', { name: '老师待分配' }))
    await user.click(within(dialog).getByRole('button', { name: /确认生成.*系统会自动创建什么/ }))

    expect(within(dialog).getByText(/时间.*待定/)).toBeInTheDocument()
    expect(within(dialog).getByText(/人物.*待分配/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '确认创建' }))

    expect(submissions[0].facts.find((fact) => fact.key === 'time')?.pending).toBe(true)
    expect(submissions[0].facts.find((fact) => fact.key === 'people')?.pending).toBe(true)
  })

  it('resets answers when reopening a different workflow and handles empty relation options', async () => {
    const user = userEvent.setup()
    render(<GuidedOpsWorkspace resources={{}} onSubmitPlan={() => undefined} />)

    await user.click(screen.getByRole('button', { name: /发布可报名活动/ }))
    const activityDialog = await screen.findByRole('dialog', { name: '发布可报名活动' })
    await user.clear(within(activityDialog).getByLabelText('活动标题'))
    await user.type(within(activityDialog).getByLabelText('活动标题'), '未保存活动')
    await user.selectOptions(within(activityDialog).getByLabelText('活动类型'), 'camp')
    await user.type(within(activityDialog).getByLabelText('活动简介'), '只测试关闭分支')
    await user.click(within(activityDialog).getByRole('button', { name: /人物.*谁负责和授课/ }))
    expect(within(activityDialog).getByText('暂无可选数据')).toBeInTheDocument()
    await user.click(within(activityDialog).getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog', { name: '发布可报名活动' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '教务排课' }))
    await user.click(screen.getByRole('button', { name: /安排体验课/ }))
    const trialDialog = await screen.findByRole('dialog', { name: '安排体验课' })
    expect(within(trialDialog).getByLabelText('体验课名称')).toHaveValue('一对一体验课')
    expect(within(trialDialog).queryByDisplayValue('未保存活动')).not.toBeInTheDocument()
  })
})
