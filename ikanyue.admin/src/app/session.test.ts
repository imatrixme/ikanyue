import { describe, expect, it } from 'vitest'

import { tokenExpiresAt } from './session'

describe('tokenExpiresAt', () => {
  it('reads exp from a base64url JWT payload and ignores malformed tokens', () => {
    const payload = btoa(JSON.stringify({ exp: 1_800_000_000 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(tokenExpiresAt(`h.${payload}.s`)).toBe(1_800_000_000_000)
    expect(tokenExpiresAt('token')).toBeNull()
    expect(tokenExpiresAt('h.not-json.s')).toBeNull()
    expect(tokenExpiresAt(`h.${btoa('{}')}.s`)).toBeNull()
    expect(tokenExpiresAt(undefined)).toBeNull()
  })
})
