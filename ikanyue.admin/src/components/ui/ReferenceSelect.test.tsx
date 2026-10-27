import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReferenceSelect } from './ReferenceSelect'

const options = [
  { value: 'student_1', label: '张琳', description: '13800138000', keywords: '声乐' },
  { value: 'student_2', label: '李明', description: '13900139000', keywords: '钢琴' },
]

describe('ReferenceSelect', () => {
  it('searches recognizable secondary information and returns the stored identifier', () => {
    const onChange = vi.fn()
    render(<ReferenceSelect aria-label="学员" onChange={onChange} options={options} value="" />)
    const input = screen.getByRole('combobox', { name: '学员' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1380' } })
    fireEvent.click(screen.getByRole('option', { name: /张琳/ }))
    expect(onChange).toHaveBeenCalledWith('student_1')
  })

  it('shows selected identity and explicit empty state', () => {
    const { rerender } = render(<ReferenceSelect aria-label="教师" onChange={() => undefined} options={options} value="student_2" />)
    expect(screen.getByRole('combobox', { name: '教师' })).toHaveValue('李明')
    rerender(<ReferenceSelect aria-label="教师" emptyLabel="暂无可分配教师" onChange={() => undefined} options={[]} value="" />)
    fireEvent.focus(screen.getByRole('combobox', { name: '教师' }))
    expect(screen.getByText('暂无可分配教师')).toBeInTheDocument()
  })
})
