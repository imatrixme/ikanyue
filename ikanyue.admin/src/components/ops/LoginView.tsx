import { LockKeyhole, LogIn } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Input'
import type { OpsApi } from '../../app/api'
import type { LoginResult } from '../../app/types'

interface LoginViewProps {
  api: OpsApi
  loading: boolean
  errorMessage?: string
  onSuccess: (result: LoginResult) => void
  onError: (message: string) => void
}

export function LoginView({ api, loading, errorMessage, onSuccess, onError }: LoginViewProps) {
  const [cellphone, setCellphone] = useState('13800138002')
  const [password, setPassword] = useState('secret')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      onSuccess(await api.login(cellphone, password))
    } catch (error) {
      onError(error instanceof Error ? error.message : '登录失败')
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-[#f6f3ed] text-[#17202a] lg:grid-cols-[420px_1fr]">
      <aside className="flex flex-col justify-between border-r border-[#d8dedb] bg-[#174a5c] p-8 text-white">
        <div>
          <div className="mb-10 inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/12">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-semibold leading-tight">看乐声乐运营后台</h1>
          <p className="mt-4 max-w-[28rem] text-sm leading-6 text-[#dfeef2]">
            教师和管理员统一处理学员、内容、运营位、评估表和评估报告。
          </p>
        </div>
        <div className="mt-10 grid gap-2 text-sm text-[#bdd9df]">
          <span>Hono Ops API</span>
          <span>PocketBase internal data center</span>
        </div>
      </aside>
      <section className="flex items-center justify-center px-5 py-10">
        <form className="w-full max-w-[400px] rounded-lg border border-[#d8dedb] bg-white p-6 shadow-sm" onSubmit={submit}>
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d29a2e]">Teacher / Admin</p>
            <h2 className="mt-2 text-2xl font-semibold">登录后台</h2>
          </div>
          {errorMessage ? <div className="mb-4 rounded-md border border-[#e6beb6] bg-[#f5e3df] px-3 py-2 text-sm text-[#843326]">{errorMessage}</div> : null}
          <div className="grid gap-4">
            <Field label="手机号" htmlFor="cellphone">
              <Input id="cellphone" value={cellphone} onChange={(event) => setCellphone(event.target.value)} />
            </Field>
            <Field label="密码" htmlFor="password">
              <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button className="w-full" disabled={loading} icon={<LogIn className="h-4 w-4" aria-hidden="true" />}>
              {loading ? '登录中' : '登录'}
            </Button>
          </div>
        </form>
      </section>
    </main>
  )
}
