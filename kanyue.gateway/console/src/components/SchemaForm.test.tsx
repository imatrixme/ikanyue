import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { SchemaForm, type JSONSchema } from './SchemaForm'

const schema: JSONSchema = {
  type: 'object',
  required: ['limit', 'window'],
  properties: {
    limit: { type: 'integer' },
    window: { type: 'string', enum: ['second', 'minute'] },
    allow: { type: 'array', items: { type: 'string' } },
    headers: { type: 'object' },
  },
}

function Harness() {
  const [value, setValue] = useState<Record<string, unknown>>({})
  return (
    <>
      <SchemaForm onChange={setValue} schema={schema} value={value} />
      <output data-testid="config">{JSON.stringify(value)}</output>
    </>
  )
}

describe('SchemaForm', () => {
  it('builds a plugin config from its schema', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('limit *'), '20')
    await userEvent.selectOptions(screen.getByLabelText('window *'), JSON.stringify('minute'))
    await userEvent.type(screen.getByLabelText('allow'), '10.0.0.0/8{Enter}{Enter}127.0.0.1')
    await userEvent.click(screen.getByLabelText('headers'))
    await userEvent.paste('{"x":"1"}')
    expect(JSON.parse(screen.getByTestId('config').textContent!)).toEqual({
      limit: 20, window: 'minute', allow: ['10.0.0.0/8', '127.0.0.1'], headers: { x: '1' },
    })
  })

  it('keeps the last valid JSON while the draft is broken', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByLabelText('headers'))
    await userEvent.paste('{"x":')
    expect(screen.getByText(/JSON 格式不正确/)).toBeInTheDocument()
    expect(screen.getByTestId('config')).toHaveTextContent('{}')
  })
})
