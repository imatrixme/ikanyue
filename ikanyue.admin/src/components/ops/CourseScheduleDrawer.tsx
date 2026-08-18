import { AlertTriangle, CalendarPlus, Save } from 'lucide-react'
import { useMemo, useState } from 'react'

import { shanghaiLocalInput, shanghaiLocalInputToIso } from '../../app/calendarLogic'
import { durationMinutes, scheduleConflicts, weeklyIntervals, type CalendarScheduleSelection } from '../../app/calendarScheduler'
import type { CourseCalendarEntry } from '../../app/calendarTypes'
import type { CourseSpec, TeachingClass } from '../../app/courseTypes'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormMessage } from '../ui/Controls'
import { DrawerShell } from '../ui/DrawerShell'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

export interface CourseScheduleInput {
  classId: string
  courseSpecId: string
  endAt: string
  location: string
  repeatCount: number
  requiredCreditTypeId: string
  requiredQuantity: number
  startAt: string
  teacherId: string
  title: string
}

interface Props {
  classes: TeachingClass[]
  courses: CourseSpec[]
  entries: CourseCalendarEntry[]
  error?: string
  loading: boolean
  onClose: () => void
  onSubmit: (input: CourseScheduleInput, action: 'draft' | 'publish') => Promise<void>
  selection: CalendarScheduleSelection
}

export function CourseScheduleDrawer(props: Props) {
  const [value, setValue] = useState<CourseScheduleInput>(() => initialValue(props.selection))
  const [validation, setValidation] = useState('')
  const intervals = useMemo(() => weeklyIntervals({ ...props.selection, startAt: value.startAt, endAt: value.endAt }, value.repeatCount), [props.selection, value.endAt, value.repeatCount, value.startAt])
  const conflicts = useMemo(() => scheduleConflicts(props.entries, intervals, value.teacherId, value.classId), [props.entries, intervals, value.classId, value.teacherId])
  const duration = durationMinutes(value.startAt, value.endAt)

  function chooseClass(classId: string) {
    const teachingClass = props.classes.find((item) => item.id === classId)
    if (!teachingClass) return setValue({ ...value, classId: '' })
    const course = props.courses.find((item) => item.id === teachingClass.courseSpecId)
    const nextDuration = Number(course?.durationMinutes || duration || 60)
    setValue({
      ...value,
      classId,
      courseSpecId: teachingClass.courseSpecId,
      endAt: new Date(Date.parse(value.startAt) + nextDuration * 60_000).toISOString(),
      location: teachingClass.location || value.location,
      requiredCreditTypeId: teachingClass.defaultCreditTypeId || course?.defaultCreditTypeId || '',
      title: teachingClass.name || course?.name || value.title,
    })
  }

  function chooseCourse(courseSpecId: string) {
    const course = props.courses.find((item) => item.id === courseSpecId)
    const nextDuration = Number(course?.durationMinutes || duration || 60)
    setValue({
      ...value,
      classId: value.classId && props.classes.find((item) => item.id === value.classId)?.courseSpecId === courseSpecId ? value.classId : '',
      courseSpecId,
      endAt: new Date(Date.parse(value.startAt) + nextDuration * 60_000).toISOString(),
      requiredCreditTypeId: course?.defaultCreditTypeId || '',
      title: course?.name || value.title,
    })
  }

  async function submit(action: 'draft' | 'publish') {
    const issue = validate(value, action, conflicts.length)
    setValidation(issue)
    if (issue) return
    await props.onSubmit(value, action)
  }

  return (
    <DrawerShell description={`${props.selection.teacherName} · ${formatRange(value.startAt, value.endAt)}`} onRequestClose={props.onClose} size="wide" title="新增排课">
      <div className="grid gap-6 p-5">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="授课教师"><Input aria-label="授课教师" disabled value={props.selection.teacherName} /></Field>
          <Field label="重复"><Select aria-label="重复" onChange={(event) => setValue({ ...value, repeatCount: Number(event.target.value) })} options={repeatOptions} value={String(value.repeatCount)} /></Field>
          <Field label="开始时间"><Input aria-label="开始时间" onChange={(event) => setValue({ ...value, startAt: shanghaiLocalInputToIso(event.target.value) })} type="datetime-local" value={shanghaiLocalInput(value.startAt)} /></Field>
          <Field label="结束时间" hint={duration ? `${duration} 分钟` : '结束时间必须晚于开始时间'}><Input aria-label="结束时间" onChange={(event) => setValue({ ...value, endAt: shanghaiLocalInputToIso(event.target.value) })} type="datetime-local" value={shanghaiLocalInput(value.endAt)} /></Field>
        </section>

        <section className="grid gap-4 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
          <Field label="班级"><Select allowEmpty aria-label="班级" onChange={(event) => chooseClass(event.target.value)} options={props.classes.map((item) => ({ label: item.name, value: item.id }))} placeholder="选择班级后可直接发布" value={value.classId} /></Field>
          <Field label="课程"><Select aria-label="课程" onChange={(event) => chooseCourse(event.target.value)} options={props.courses.map((item) => ({ label: item.name, value: item.id }))} value={value.courseSpecId} /></Field>
          <Field label="课堂名称"><Input aria-label="课堂名称" onChange={(event) => setValue({ ...value, title: event.target.value })} value={value.title} /></Field>
          <Field label="地点"><Input aria-label="地点" onChange={(event) => setValue({ ...value, location: event.target.value })} value={value.location} /></Field>
          <Field label="每人课时"><Input aria-label="每人课时" min="1" onChange={(event) => setValue({ ...value, requiredQuantity: Number(event.target.value) })} type="number" value={value.requiredQuantity} /></Field>
          <Field label="课时类型"><Input aria-label="课时类型" disabled value={value.requiredCreditTypeId ? '随课程自动配置' : '未配置'} /></Field>
        </section>

        {conflicts.length ? <section className="border-l-2 border-[var(--destructive)] bg-[var(--danger-soft)] px-4 py-3" role="alert"><div className="flex items-center gap-2 text-sm font-semibold text-[var(--destructive)]"><AlertTriangle className="h-4 w-4" />时间冲突</div><div className="mt-2 grid gap-1 text-xs text-[var(--destructive)]">{conflicts.slice(0, 3).map((entry) => <p key={entry.lessonId}>{entry.title} · {formatRange(entry.startAt!, entry.endAt!)}</p>)}</div></section> : null}
        {props.error ? <FormMessage tone="error">{props.error}</FormMessage> : null}
        {validation ? <FormMessage tone="error">{validation}</FormMessage> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
          <Badge tone="neutral">{value.repeatCount} 次 · 每次 {duration || 0} 分钟</Badge>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={props.onClose} type="button" variant="secondary">取消</Button>
            <Button disabled={props.loading} icon={<Save className="h-4 w-4" />} onClick={() => void submit('draft')} type="button" variant="secondary">保存草稿</Button>
            <Button disabled={props.loading || conflicts.length > 0 || !value.classId} icon={<CalendarPlus className="h-4 w-4" />} onClick={() => void submit('publish')} type="button">创建并发布</Button>
          </div>
        </div>
      </div>
    </DrawerShell>
  )
}

function initialValue(selection: CalendarScheduleSelection): CourseScheduleInput {
  return {
    classId: '', courseSpecId: '', endAt: selection.endAt, location: '', repeatCount: 1,
    requiredCreditTypeId: '', requiredQuantity: 1, startAt: selection.startAt,
    teacherId: selection.teacherId, title: '',
  }
}

function validate(value: CourseScheduleInput, action: 'draft' | 'publish', conflictCount: number): string {
  if (!value.title.trim()) return '请选择课程或填写课堂名称'
  if (!value.courseSpecId || !value.requiredCreditTypeId) return '请选择已配置课时类型的课程或班级'
  if (!durationMinutes(value.startAt, value.endAt)) return '结束时间必须晚于开始时间'
  if (!Number.isInteger(value.requiredQuantity) || value.requiredQuantity < 1) return '每人课时必须为正整数'
  if (action === 'publish' && !value.classId) return '发布课堂前请选择班级'
  if (action === 'publish' && conflictCount) return '当前时间存在冲突，可先保存草稿后再调整'
  return ''
}

function formatRange(startAt: string, endAt: string) {
  const format = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
  return `${format(startAt)} - ${format(endAt)}`
}

const repeatOptions = [
  { label: '仅本次', value: '1' },
  { label: '每周，共 4 次', value: '4' },
  { label: '每周，共 8 次', value: '8' },
]
