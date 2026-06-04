import { LockKeyhole, LogIn, UserPlus } from 'lucide-react'
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
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [realName, setRealName] = useState('')
  const [nickName, setNickName] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuccessMessage('')
    try {
      if (mode === 'register') {
        const result = await api.register({ cellphone: account, password, realName, nickName })
        setSuccessMessage(result.message || '注册成功，请等待管理员激活')
        return
      }
      onSuccess(await api.login(account, password))
    } catch (error) {
      onError(error instanceof Error ? error.message : mode === 'register' ? '注册失败' : '登录失败')
    }
  }

  function switchMode(nextMode: 'login' | 'register') {
    setMode(nextMode)
    setSuccessMessage('')
  }

  return (
    <main className="grid min-h-screen grid-cols-1 text-[var(--foreground)] lg:grid-cols-[420px_1fr]">
      <aside className="flex flex-col justify-between border-r border-[var(--border)] bg-[var(--primary)] p-8 text-[var(--primary-foreground)]">
        <div>
          <div className="mb-10 inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/10">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-semibold leading-tight">看乐声乐运营后台</h1>
          <p className="mt-4 max-w-[28rem] text-sm leading-6 text-slate-300">
            教师和管理员统一处理学员、内容、运营位、评估表和评估报告。
          </p>
        </div>
        <div className="mt-10 grid gap-2 text-sm text-slate-400">
          <span>Hono Ops API</span>
          <span>PocketBase internal data center</span>
        </div>
      </aside>
      <section className="flex items-center justify-center px-5 py-10">
        <form className="w-full max-w-[400px] rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm shadow-slate-200/60" onSubmit={submit}>
          <div className="mb-6">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">Teacher / Admin</p>
            <h2 className="mt-2 text-2xl font-semibold">{mode === 'register' ? '注册教师账号' : '账号或手机号登录'}</h2>
          </div>
          <div className="mb-4 grid grid-cols-2 rounded-md border border-[var(--border)] bg-[var(--muted)] p-1 text-sm font-medium">
            <button
              aria-label="切换到登录"
              className={`rounded px-3 py-2 ${mode === 'login' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
              type="button"
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              aria-label="切换到注册"
              className={`rounded px-3 py-2 ${mode === 'register' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
              type="button"
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>
          {errorMessage ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div> : null}
          {successMessage ? <div className="mb-4 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-700">{successMessage}</div> : null}
          <div className="grid gap-4">
            <Field label={mode === 'register' ? '手机号' : '账号或手机号'} htmlFor="ops-account">
              <Input
                id="ops-account"
                placeholder={mode === 'register' ? '请输入手机号' : 'admin / 手机号'}
                value={account}
                onChange={(event) => setAccount(event.target.value)}
              />
            </Field>
            {mode === 'register' ? (
              <>
                <Field label="姓名" htmlFor="realName">
                  <Input id="realName" value={realName} onChange={(event) => setRealName(event.target.value)} />
                </Field>
                <Field label="昵称" htmlFor="nickName">
                  <Input id="nickName" value={nickName} onChange={(event) => setNickName(event.target.value)} />
                </Field>
              </>
            ) : null}
            <Field label="密码" htmlFor="password">
              <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button className="w-full" disabled={loading} icon={mode === 'register' ? <UserPlus className="h-4 w-4" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}>
              {loading ? (mode === 'register' ? '注册中' : '登录中') : (mode === 'register' ? '提交注册' : '登录')}
            </Button>
          </div>
        </form>
      </section>
    </main>
  )
}
