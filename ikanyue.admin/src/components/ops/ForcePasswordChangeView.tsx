import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { OpsApi } from '../../app/api'
import type { LoginResult, OpsProfile } from '../../app/types'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { Field, Input } from '../ui/Input'

interface ForcePasswordChangeViewProps {
  api: OpsApi
  token: string
  profile: OpsProfile
  errorMessage?: string
  onSuccess: (result: LoginResult) => void
  onError: (message: string) => void
}

export function ForcePasswordChangeView({ api, token, profile, errorMessage, onSuccess, onError }: ForcePasswordChangeViewProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      onSuccess(await api.changePassword(token, { currentPassword, newPassword, confirmPassword }))
    } catch (error) {
      onError(error instanceof Error ? error.message : '修改密码失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10 text-[var(--foreground)]">
      <Panel className="w-full max-w-[420px] p-6">
        <div className="mb-6">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold">修改初始密码</h1>
          <p className="ky-paragraph mt-2">
            {profile.realName || profile.nickName || profile.cellphone} 首次登录后台前需要设置新的管理员密码。
          </p>
        </div>
        {errorMessage ? <div className="mb-4 rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--destructive)]">{errorMessage}</div> : null}
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="当前密码" htmlFor="current-password">
            <Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </Field>
          <Field label="新密码" htmlFor="new-password">
            <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </Field>
          <Field label="确认新密码" htmlFor="confirm-password">
            <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </Field>
          <Button className="w-full" disabled={submitting} icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}>
            {submitting ? '修改中' : '确认修改'}
          </Button>
        </form>
      </Panel>
    </main>
  )
}
