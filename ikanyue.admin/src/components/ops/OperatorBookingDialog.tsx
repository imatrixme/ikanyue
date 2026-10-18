import { useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { BookingSlot, StudentBookingOption } from '../../app/bookingTypes'
import { personOption } from '../../app/coursePresentation'
import { listAllStudents } from '../../app/studentDirectory'
import type { StudentRecord } from '../../app/types'
import { Button } from '../ui/Button'
import { Checkbox, Textarea } from '../ui/Controls'
import { DialogShell } from '../ui/DialogShell'
import { Field } from '../ui/Input'
import { ReferenceSelect } from '../ui/ReferenceSelect'
import { Select } from '../ui/Select'
import { useNotify } from '../ui/notifyContext'

interface OperatorBookingDialogProps {
  api: OpsApi
  token: string
  /** Fixed student (student page). Without it the dialog offers a student picker. */
  student?: { id: string; name: string }
  onClose: () => void
  onBooked: () => void
}

/** Books a one-to-one lesson for a student who called in. Slots and balance follow the miniapp rules. */
export function OperatorBookingDialog({ api, onBooked, onClose, student, token }: OperatorBookingDialogProps) {
  const notify = useNotify()
  const [students, setStudents] = useState<StudentRecord[] | null>(student ? [] : null)
  const [studentId, setStudentId] = useState(student?.id || '')
  const [options, setOptions] = useState<StudentBookingOption[] | null>(null)
  const [offeringId, setOfferingId] = useState('')
  const [slots, setSlots] = useState<BookingSlot[] | null>(null)
  const [slotKey, setSlotKey] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (student) return
    let current = true
    listAllStudents(api, token).then((result) => { if (current) setStudents(result.items) }).catch((loadError) => { if (current) { setStudents([]); setError(message(loadError, '加载学员失败')) } })
    return () => { current = false }
  }, [api, student, token])

  useEffect(() => {
    if (!studentId) return
    let current = true
    api.listStudentBookingOptions(token, studentId).then((items) => { if (current) setOptions(items) }).catch((loadError) => { if (current) { setOptions([]); setError(message(loadError, '加载可约课程失败')) } })
    return () => { current = false }
  }, [api, studentId, token])

  useEffect(() => {
    if (!studentId || !offeringId) return
    let current = true
    api.listStudentBookingSlots(token, studentId, offeringId).then((items) => { if (current) setSlots(items) }).catch((loadError) => { if (current) { setSlots([]); setError(message(loadError, '加载可约时间失败')) } })
    return () => { current = false }
  }, [api, offeringId, studentId, token])

  function chooseStudent(value: string) { setStudentId(value); setOptions(null); setOfferingId(''); setSlots(null); setSlotKey(''); setError('') }
  function chooseOffering(value: string) { setOfferingId(value); setSlots(null); setSlotKey(''); setError('') }

  const slot = slots?.find((item) => item.startAt === slotKey)
  const valid = Boolean(studentId && offeringId && slot)

  async function submit() {
    if (!slot) return
    setSaving(true); setError('')
    try {
      await api.createAppointmentForStudent(token, { studentId, offeringId, startAt: slot.startAt, endAt: slot.endAt, note: note.trim() || undefined, confirm })
      notify(confirm ? '已代约并确认' : '已代约，等待确认')
      onBooked()
      onClose()
    } catch (saveError) {
      setError(message(saveError, '代约失败'))
      setSaving(false)
    }
  }

  return (
    <DialogShell description={student?.name} dismissible={!saving} onRequestClose={onClose} size="compact" title="代约一对一">
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        {error ? <p className="text-sm text-[var(--destructive)]" role="alert">{error}</p> : null}
        {student ? null : <Field htmlFor="operator-booking-student" label="学员"><ReferenceSelect emptyLabel="暂无学员" id="operator-booking-student" loading={students === null} onChange={chooseStudent} options={(students || []).map(personOption)} placeholder="搜索姓名或手机号" value={studentId} /></Field>}
        <Field htmlFor="operator-booking-offering" label="课程与教师"><Select allowEmpty disabled={!studentId || options === null} emptyLabel="这名学员暂无可约课程" id="operator-booking-offering" onChange={(event) => chooseOffering(event.target.value)} options={(options || []).map((item) => ({ label: `${item.course.name} · ${item.teacher.name}`, value: item.offeringId }))} placeholder={studentId && options === null ? '正在加载...' : '选择课程'} value={offeringId} /></Field>
        <Field htmlFor="operator-booking-slot" label="上课时间"><Select allowEmpty disabled={!offeringId || slots === null} emptyLabel="近期没有可约时间" id="operator-booking-slot" onChange={(event) => setSlotKey(event.target.value)} options={(slots || []).map((item) => ({ label: slotLabel(item), value: item.startAt }))} placeholder={offeringId && slots === null ? '正在加载...' : '选择时间'} value={slotKey} /></Field>
        <Field htmlFor="operator-booking-note" label="备注"><Textarea id="operator-booking-note" maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="例如：电话预约" value={note} /></Field>
        <Checkbox checked={confirm} description="已与学员确认时间，提交后直接成课" label="同时确认预约" onChange={(event) => setConfirm(event.target.checked)} />
        <div className="flex justify-end gap-2"><Button disabled={saving} onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={saving || !valid} type="submit">{saving ? '提交中...' : '提交预约'}</Button></div>
      </form>
    </DialogShell>
  )
}

function slotLabel(slot: BookingSlot) {
  const format = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, ...options }).format(new Date(value))
  return `${format(slot.startAt, { month: 'long', day: 'numeric', weekday: 'short' })} ${format(slot.startAt, { hour: '2-digit', minute: '2-digit' })}–${format(slot.endAt, { hour: '2-digit', minute: '2-digit' })}`
}

function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
