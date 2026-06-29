import { describe, expect, it } from 'vitest'

import { render } from './entry-server'

describe('ssr entry', () => {
  it('renders the login shell on the server', () => {
    expect(render()).toContain('看乐积分兑换后台')
  })
})
