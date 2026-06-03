import { describe, expect, it } from 'vitest'

import { render } from './entry-server'

describe('ssr entry', () => {
  it('renders the login shell on the server', () => {
    expect(render()).toContain('看乐声乐运营后台')
  })
})
