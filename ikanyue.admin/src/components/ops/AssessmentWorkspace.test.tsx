import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { mockTemplates } from '../../app/mockData'
import { AssessmentWorkspace } from './AssessmentWorkspace'

describe('AssessmentWorkspace explicit selections', () => {
  it('submits assessment with selected template and student', async () => {
    const user = userEvent.setup()
    const submissions: Array<{ templateId?: string; studentId?: string }> = []
    render(
      <AssessmentWorkspace
        templates={mockTemplates.items}
        students={[
          { id: 'student_1', realName: '张同学' },
          { id: 'student_2', realName: '李同学' },
        ]}
        onSubmit={(_, options) => {
          submissions.push(options)
        }}
      />,
    )

    await user.selectOptions(screen.getByLabelText('评估模板'), 'template_2')
    await user.selectOptions(screen.getByLabelText('评估学员'), 'student_2')
    await user.click(screen.getByRole('button', { name: '提交并生成报告' }))
    expect(submissions[0]).toEqual({ templateId: 'template_2', studentId: 'student_2' })
  })
})
