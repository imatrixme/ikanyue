import { useState } from 'react'

import { addDateDays, shanghaiDayStartIso, todayKey } from '../../app/calendarLogic'
import { followUpStatusLabels } from '../../app/coursePresentation'
import type { FollowUpStatus, StudentFollowUpInput } from '../../app/courseTypes'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Controls'
import { DialogShell } from '../ui/DialogShell'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

/** Records a renewal conversation; the student leaves Today until the chosen date. */
export function FollowUpDialog({ onClose, onSave, studentName }: { onClose: () => void; onSave: (input: StudentFollowUpInput) => Promise<unknown>; studentName: string }) {
  const [status, setStatus] = useState<FollowUpStatus>('contacted')
  const [note, setNote] = useState('')
  const [minDate] = useState(() => addDateDays(todayKey(), 1))
  const [date, setDate] = useState(() => addDateDays(todayKey(), 7))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const valid = Boolean(date) && date >= minDate

  async function submit() {
    if (!valid) return
    setSaving(true); setError('')
    try {
      await onSave({ status, note: note.trim(), snoozeUntil: shanghaiDayStartIso(date) })
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '记录跟进失败')
      setSaving(false)
    }
  }

  return (
    <DialogShell description={studentName} dismissible={!saving} onRequestClose={onClose} size="compact" title="记录续课跟进">
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        {error ? <p className="text-sm text-[var(--destructive)]" role="alert">{error}</p> : null}
        <Field htmlFor="follow-up-status" label="跟进结果"><Select id="follow-up-status" onChange={(event) => setStatus(event.target.value as FollowUpStatus)} options={Object.entries(followUpStatusLabels).map(([value, label]) => ({ label, value }))} value={status} /></Field>
        <Field htmlFor="follow-up-date" hint="在此之前不再出现在今日待办" label="下次提醒"><Input id="follow-up-date" min={minDate} onChange={(event) => setDate(event.target.value)} required type="date" value={date} /></Field>
        <Field htmlFor="follow-up-note" label="备注"><Textarea id="follow-up-note" maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="例如：家长下周确认续课" value={note} /></Field>
        <div className="flex justify-end gap-2"><Button disabled={saving} onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={saving || !valid} type="submit">{saving ? '保存中...' : '保存跟进'}</Button></div>
      </form>
    </DialogShell>
  )
}
