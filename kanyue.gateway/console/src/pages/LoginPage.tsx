import { useState, type FormEvent } from 'react'

import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Controls'
import { Alert, ErrorText } from '../components/ui/Feedback'
import { Panel } from '../components/ui/Panel'
import { ApiError, errorText, request, session } from '../lib/api'

interface AuthResponse {
  token: string
}

const auth = (action: string, body: unknown) => request<AuthResponse & { otpId?: string }>('POST', `/api/collections/_superusers/${action}`, body)

// LoginPage signs a superuser in with password, then the authenticator code:
// the password step answers 401 with an mfaId, the gateway accepts the TOTP
// code as the one-time password of a fresh OTP request.
export function LoginPage() {
  const [email, setEmail] = useState(session.email())
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<{ mfaId: string; otpId: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (pending) {
        const result = await auth('auth-with-otp', { otpId: pending.otpId, password: code, mfaId: pending.mfaId })
        session.signIn(result.token, email)
        return
      }
      try {
        const result = await auth('auth-with-password', { identity: email, password })
        session.signIn(result.token, email)
      } catch (failure) {
        const mfaId = failure instanceof ApiError ? failure.body.mfaId : undefined
        if (typeof mfaId !== 'string') throw failure
        const otp = await auth('request-otp', { email })
        setPending({ mfaId, otpId: String(otp.otpId) })
      }
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 429
        ? '尝试次数过多，请约 3 分钟后用新的动态码再试。'
        : pending && failure instanceof ApiError && failure.status === 400
          ? '动态码不正确或已使用，请等下一个动态码再试。'
          : errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto mt-[12vh] max-w-md px-4">
      <Panel>
        <form className="grid gap-3" onSubmit={submit}>
          <h1 className="text-lg font-semibold">看乐网关控制台</h1>
          <Field label="邮箱">
            <Input autoComplete="username" disabled={Boolean(pending)} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </Field>
          <Field label="密码">
            <Input autoComplete="current-password" disabled={Boolean(pending)} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </Field>
          {pending ? (
            <>
              <Alert>请输入验证器 App 中的 6 位动态码。</Alert>
              <Field label="动态码">
                <Input autoComplete="one-time-code" autoFocus inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value)} pattern="[0-9]{6}" required value={code} />
              </Field>
            </>
          ) : null}
          <ErrorText error={error} />
          <Button disabled={busy} type="submit" variant="primary">{pending ? '验证' : '登录'}</Button>
          <p className="text-xs text-[var(--muted-foreground)]">首次使用前，在服务器上运行 kanyue-gateway totp enroll &lt;邮箱&gt; --encryptionEnv=GATEWAY_ENCRYPTION_KEY 绑定验证器。</p>
        </form>
      </Panel>
    </main>
  )
}
