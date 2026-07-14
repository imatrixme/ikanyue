import { useMemo, useState } from 'react'

import type { StudentInput, StudentRecord } from '../../app/types'
import { Button } from '../ui/Button'
import { DialogShell } from '../ui/DialogShell'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface StudentEditorDialogProps {
  loading: boolean
  onClose: () => void
  onSave: (id: string | null, payload: StudentInput) => Promise<boolean>
  student: StudentRecord | null
}

interface StudentFormState {
  blocked: 'active' | 'inactive'
  cellphone: string
  nickName: string
  password: string
  realName: string
}

export function StudentEditorDialog({ loading, onClose, onSave, student }: StudentEditorDialogProps) {
  const initial = useMemo(() => studentForm(student), [student])
  const [form, setForm] = useState(initial)
  const [discardPrompt, setDiscardPrompt] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  function update<K extends keyof StudentFormState>(key: K, value: StudentFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function requestClose() {
    if (dirty) setDiscardPrompt(true)
    else onClose()
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await onSave(student?.id || null, {
      blocked: form.blocked === 'inactive',
      cellphone: form.cellphone.trim(),
      nickName: form.nickName.trim(),
      password: form.password,
      realName: form.realName.trim(),
    })
    if (saved) onClose()
  }

  const valid = Boolean(form.realName.trim() && form.cellphone.trim() && (student || form.password.trim()))

  return (
    <DialogShell
      description={student ? '修改学员身份与可用状态' : '创建后即可进行积分操作'}
      onRequestClose={discardPrompt ? () => setDiscardPrompt(false) : requestClose}
      size="medium"
      title={student ? `编辑${studentName(student)}` : '新增学员'}
    >
      {discardPrompt ? (
        <div className="border-b border-[var(--destructive)]/20 bg-[var(--danger-soft)] px-5 py-4" role="alert">
          <p className="font-semibold text-[var(--destructive)]">放弃未保存修改？</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">当前学员信息尚未保存。</p>
          <div className="mt-3 flex gap-2">
            <Button data-autofocus onClick={() => setDiscardPrompt(false)} type="button" variant="secondary">继续编辑</Button>
            <Button onClick={onClose} type="button" variant="danger">放弃修改</Button>
          </div>
        </div>
      ) : null}
      <form className="flex min-h-full flex-col" onSubmit={submit}>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="学员姓名" htmlFor="student-real-name"><Input data-autofocus id="student-real-name" value={form.realName} onChange={(event) => update('realName', event.target.value)} /></Field>
          <Field label="昵称" htmlFor="student-nickname"><Input id="student-nickname" value={form.nickName} onChange={(event) => update('nickName', event.target.value)} /></Field>
          <Field label="手机号" htmlFor="student-cellphone"><Input id="student-cellphone" inputMode="tel" value={form.cellphone} onChange={(event) => update('cellphone', event.target.value)} /></Field>
          <Field label="状态" htmlFor="student-status"><Select id="student-status" options={[{ value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }]} value={form.blocked} onChange={(event) => update('blocked', event.target.value as StudentFormState['blocked'])} /></Field>
          <Field className="sm:col-span-2" label={student ? '重置密码' : '初始密码'} htmlFor="student-password" hint={student ? '留空则保持当前密码。' : '创建学员时必填。'}><Input autoComplete="new-password" id="student-password" type="password" value={form.password} onChange={(event) => update('password', event.target.value)} /></Field>
        </div>
        <div className="sticky bottom-0 mt-auto flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <Button onClick={requestClose} type="button" variant="secondary">取消</Button>
          <Button disabled={loading || !valid}>{student ? '保存学员' : '创建学员'}</Button>
        </div>
      </form>
    </DialogShell>
  )
}

function studentForm(student: StudentRecord | null): StudentFormState {
  return { blocked: student?.blocked ? 'inactive' : 'active', cellphone: student?.cellphone || '', nickName: student?.nickName || '', password: '', realName: student?.realName || '' }
}

function studentName(student: StudentRecord) {
  return student.realName || student.nickName || student.cellphone || '学员'
}
