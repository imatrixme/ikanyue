import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { session } from '../lib/api'
import { mockFetch } from '../test/fetch'
import { LoginPage } from './LoginPage'

const base = '/api/collections/_superusers'

describe('LoginPage', () => {
  it('signs in with password, then the authenticator code', async () => {
    const calls = mockFetch({
      [`POST ${base}/auth-with-password`]: { status: 401, body: { mfaId: 'mfa1' } },
      [`POST ${base}/request-otp`]: { body: { otpId: 'otp1' } },
      [`POST ${base}/auth-with-otp`]: { body: { token: 'tok' } },
    })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('邮箱'), 'ops@example.com')
    await userEvent.type(screen.getByLabelText('密码'), 'pw-for-test')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    await userEvent.type(await screen.findByLabelText('动态码'), '123456')
    await userEvent.click(screen.getByRole('button', { name: '验证' }))

    expect(calls.map((call) => call.url)).toEqual([`${base}/auth-with-password`, `${base}/request-otp`, `${base}/auth-with-otp`])
    expect(calls[2].body).toEqual({ otpId: 'otp1', password: '123456', mfaId: 'mfa1' })
    expect(session.token()).toBe('tok')
  })

  it('explains a rejected code and keeps the MFA step', async () => {
    mockFetch({
      [`POST ${base}/auth-with-password`]: { status: 401, body: { mfaId: 'mfa1' } },
      [`POST ${base}/request-otp`]: { body: { otpId: 'otp1' } },
      [`POST ${base}/auth-with-otp`]: { status: 400, body: { message: 'Invalid or expired OTP' } },
    })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('邮箱'), 'ops@example.com')
    await userEvent.type(screen.getByLabelText('密码'), 'pw-for-test')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    await userEvent.type(await screen.findByLabelText('动态码'), '000000')
    await userEvent.click(screen.getByRole('button', { name: '验证' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('动态码不正确或已使用')
    expect(session.token()).toBe('')
  })

  it('shows a wrong password as is', async () => {
    mockFetch({ [`POST ${base}/auth-with-password`]: { status: 400, body: { message: 'Failed to authenticate.' } } })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('邮箱'), 'ops@example.com')
    await userEvent.type(screen.getByLabelText('密码'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to authenticate.')
    expect(screen.queryByLabelText('动态码')).toBeNull()
  })

  it('explains the attempt limit in Chinese', async () => {
    mockFetch({ [`POST ${base}/auth-with-password`]: { status: 429, body: { message: 'Too many attempts, please try again later with a new OTP.' } } })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('邮箱'), 'ops@example.com')
    await userEvent.type(screen.getByLabelText('密码'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('尝试次数过多')
  })
})
