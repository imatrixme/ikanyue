import { Eye, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { BookingReferenceData } from '../../app/bookingTypes'
import { viewBusinessIcons } from '../../app/businessIcons'
import { creditStatusLabel, formatDate, formatDateTime, personName, roleLabel, statusLabel } from '../../app/coursePresentation'
import type { CourseRecord, CourseResourceInput, Lesson, SettlementPreview } from '../../app/courseTypes'
import type { OpsProfile, StudentRecord } from '../../app/types'
import { PageHeader, SectionHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { DrawerShell } from '../ui/DrawerShell'
import { Field, Input } from '../ui/Input'
import { ReferenceSelect } from '../ui/ReferenceSelect'
import { Select } from '../ui/Select'
import { TechnicalDetails } from '../ui/TechnicalDetails'

interface LessonsWorkspaceProps { api: OpsApi; profile: OpsProfile; token: string }
type LessonAction = 'complete' | 'settle' | 'reverse' | 'cancel'

export function LessonsWorkspace({ api, profile, token }: LessonsWorkspaceProps) {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selected, setSelected] = useState<Lesson | null>(null)
  const [students, setStudents] = useState<CourseRecord[]>([])
  const [teachers, setTeachers] = useState<CourseRecord[]>([])
  const [studentReferences, setStudentReferences] = useState<StudentRecord[]>([])
  const [referenceData, setReferenceData] = useState<BookingReferenceData>({ teachers: [], courses: [], creditTypes: [], policies: [] })
  const [classes, setClasses] = useState<CourseRecord[]>([])
  const [editor, setEditor] = useState<Lesson | null | undefined>(undefined)
  const [publishTarget, setPublishTarget] = useState<Lesson | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<Lesson | null>(null)
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreview | null>(null)
  const [confirmAction, setConfirmAction] = useState<LessonAction | null>(null)
  const [actionTarget, setActionTarget] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const capabilities = profile.courseCreditCapabilities || []
  const canAcademic = profile.isAdmin || capabilities.includes('course_credit.academic')
  const canTeach = canAcademic || capabilities.includes('course_credit.teacher')
  const canSettle = profile.isAdmin || capabilities.includes('course_credit.settlement')
  const usesGlobalLessons = canAcademic || canSettle
  const resource = usesGlobalLessons ? 'lessons' : 'assignedLessons'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [page, referenceResult, classPage, studentPage] = await Promise.all([
        api.listCourseResource<Lesson>(token, resource, { page: 1, perPage: 100 }),
        api.getBookingReferenceData(token),
        canAcademic ? api.listCourseResource(token, 'classes', { page: 1, perPage: 100 }) : Promise.resolve({ items: [] }),
        profile.isAdmin ? api.listManagedStudents(token, { page: 1, perPage: 100 }) : api.listAssignedStudents(token, { page: 1, perPage: 100 }),
      ])
      setLessons(page.items)
      setReferenceData(referenceResult)
      setClasses(classPage.items)
      setStudentReferences(studentPage.items)
    } catch (loadError) { setError(message(loadError, '加载课堂失败')) }
    finally { setLoading(false) }
  }, [api, canAcademic, profile.isAdmin, resource, token])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function openLesson(lesson: Lesson) {
    setSelected(lesson)
    setLoading(true)
    try {
      if (usesGlobalLessons) {
        const [studentPage, teacherPage] = await Promise.all([
          api.listCourseResource(token, 'sessionStudents', { sessionId: lesson.id, page: 1, perPage: 100 }),
          api.listCourseResource(token, 'sessionTeachers', { sessionId: lesson.id, page: 1, perPage: 100 }),
        ])
        setStudents(studentPage.items)
        setTeachers(teacherPage.items)
      } else {
        const page = await api.listCourseResource<Lesson>(token, 'assignedLessons', { sessionId: lesson.id, page: 1, perPage: 1 })
        const assigned = page.items[0]
        if (!assigned) throw new Error('课堂不在当前教师的授课范围内')
        setSelected(assigned)
        setStudents(assigned.students || [])
        setTeachers(assigned.teachers || [])
      }
    } catch (detailError) { setError(message(detailError, '加载课堂名单失败')) }
    finally { setLoading(false) }
  }

  async function saveLesson(values: Partial<Lesson>) {
    setLoading(true)
    const data: CourseResourceInput = {
      code: values.code,
      title: values.title,
      status: values.status || 'draft',
      startAt: toIsoDate(values.startAt),
      endAt: toIsoDate(values.endAt),
      location: values.location,
      requiredCreditTypeId: values.requiredCreditTypeId,
      requiredQuantity: Number(values.requiredQuantity || 1),
      rosterVersion: Number(values.rosterVersion || 1),
      version: Number(values.version || 1),
      attendanceRuleSnapshot: values.attendanceRuleSnapshot || { version: 1 },
      settlementRuleSnapshot: values.settlementRuleSnapshot || { version: 1 },
      teacherRuleSnapshot: values.teacherRuleSnapshot || { version: 1 },
    }
    try {
      if (editor?.id) await api.updateCourseResource(token, 'lessons', editor.id, data)
      else await api.createCourseResource(token, 'lessons', data)
      setEditor(undefined)
      await load()
    } catch (saveError) { setError(message(saveError, '保存课堂失败')); setLoading(false) }
  }

  async function publish(lesson: Lesson, classIds: string[]) {
    setLoading(true)
    try { await api.publishLesson(token, lesson.id, classIds); setPublishTarget(null); await load() }
    catch (publishError) { setError(message(publishError, '发布课堂失败')); setLoading(false) }
  }

  async function reschedule(lesson: Lesson, newStartAt: string, newEndAt: string, reason: string) {
    setLoading(true)
    try { await api.rescheduleLesson(token, lesson.id, toIsoDate(newStartAt), toIsoDate(newEndAt), reason); setRescheduleTarget(null); await load() }
    catch (rescheduleError) { setError(message(rescheduleError, '调整课堂时间失败')); setLoading(false) }
  }

  async function updateAttendance(lesson: Lesson, record: CourseRecord, attendanceStatus: string) {
    await api.setAttendance(token, lesson.id, record.id, attendanceStatus)
    await openLesson(lesson)
  }

  async function markAllPresent(lesson: Lesson) {
    await api.markAllPresent(token, lesson.id)
    await openLesson(lesson)
  }

  async function updateTeacher(lesson: Lesson, record: CourseRecord, actualStatus: string) {
    await api.setActualTeacher(token, lesson.id, record.id, actualStatus)
    await openLesson(lesson)
  }

  async function previewSettlement(lesson: Lesson) {
    try {
      setLoading(true)
      const preview = await api.previewSettlement(token, lesson.id)
      setActionTarget(lesson)
      setSelected(null)
      setSettlementPreview(preview)
    } catch (previewError) {
      setError(message(previewError, '加载核销预览失败'))
    } finally {
      setLoading(false)
    }
  }

  async function runConfirmedAction(lesson: Lesson, action: LessonAction) {
    setLoading(true)
    try {
      if (action === 'settle') await api.settleLesson(token, lesson.id)
      if (action === 'reverse') await api.reverseSettlement(token, lesson.id, 'admin_correction')
      if (action === 'cancel') await api.setCourseResourceStatus(token, 'lessons', lesson.id, 'cancelled', 'admin_cancelled')
      if (action === 'complete') await api.setCourseResourceStatus(token, 'lessons', lesson.id, 'completed', 'manual_completion')
      setConfirmAction(null)
      setActionTarget(null)
      setSettlementPreview(null)
      await load()
    } catch (actionError) { setError(message(actionError, '课堂操作失败')); setLoading(false) }
  }

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = lessons.filter((lesson) => lesson.startAt?.startsWith(today)).length
  const pendingSettlement = lessons.filter((lesson) => ['completed', 'correction_pending'].includes(String(lesson.status))).length

  function beginAction(lesson: Lesson, action: Exclude<LessonAction, 'settle'>) {
    setActionTarget(lesson)
    setSelected(null)
    setConfirmAction(action)
  }

  function beginReschedule(lesson: Lesson) {
    setRescheduleTarget(lesson)
    setSelected(null)
  }

  const teacherOnly = canTeach && !canAcademic && !canSettle
  const settlementOnly = canSettle && !canAcademic && !canTeach
  const title = teacherOnly ? '我的课堂' : settlementOnly ? '课堂核销' : '课堂管理'
  const description = teacherOnly
    ? '查看本人负责的课堂，登记学员出勤并确认本人实际授课状态。'
    : settlementOnly
      ? '查看全部课堂名单，预览并确认课时核销；排课和出勤由教务与教师维护。'
      : '创建与发布课堂，维护名单、出勤和实际授课教师；核销操作按权限独立开放。扫码签到留待下期。'
  const badge = canSettle ? `${pendingSettlement} 节待核销` : teacherOnly ? `${lessons.length} 节已分配` : `${lessons.length} 节课堂`
  const actionCopy = lessonActionCopy(confirmAction)

  return <WorkspacePanel><PageHeader actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="重新加载课堂" onClick={() => void load()} type="button" />{canAcademic ? <IconButton icon={<Plus className="h-4 w-4" />} label="新增课堂" onClick={() => setEditor(null)} type="button" variant="primary" /> : null}</>} badge={<Badge tone={pendingSettlement && canSettle ? 'amber' : 'green'}>{badge}</Badge>} description={description} eyebrow={teacherOnly ? '授课安排' : settlementOnly ? '课时核销' : '排课与课堂'} title={title} icon={viewBusinessIcons.lessons} /><SummaryBand><SummaryMetric label="今日课堂" value={todayCount} />{canSettle ? <SummaryMetric label="待核销" value={pendingSettlement} /> : null}<SummaryMetric label={teacherOnly ? '负责课堂' : '全部课堂'} value={lessons.length} /></SummaryBand><AsyncState empty={lessons.length === 0 ? <EmptyState noun="课堂" onCreate={canAcademic ? () => setEditor(null) : undefined} /> : undefined} error={error} loading={loading && lessons.length === 0} loadingLabel="正在加载课堂..." onRetry={() => void load()}><ResponsiveDataRegion desktop={<LessonTable lessons={lessons} onEdit={canAcademic ? setEditor : undefined} onOpen={openLesson} onPublish={canAcademic ? setPublishTarget : undefined} />} mobile={lessons.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} onOpen={() => void openLesson(lesson)} />)} /></AsyncState>{selected ? <LessonDrawer canAcademic={canAcademic} canSettle={canSettle} canTeach={canTeach} lesson={selected} loading={loading} onAllPresent={() => markAllPresent(selected)} onAttendance={(record, status) => updateAttendance(selected, record, status)} onCancel={() => beginAction(selected, 'cancel')} onClose={() => setSelected(null)} onComplete={() => beginAction(selected, 'complete')} onPreviewSettlement={() => previewSettlement(selected)} onReschedule={() => beginReschedule(selected)} onReverse={() => beginAction(selected, 'reverse')} studentReferences={studentReferences} students={students} teacherId={profile.id} teacherReferences={referenceData.teachers} teachers={teachers} onTeacher={(record, status) => updateTeacher(selected, record, status)} /> : null}{canAcademic && editor !== undefined ? <LessonEditor creditTypes={referenceData.creditTypes} lesson={editor} loading={loading} onClose={() => setEditor(undefined)} onSave={saveLesson} /> : null}{canAcademic && publishTarget ? <PublishDialog classes={classes} lesson={publishTarget} loading={loading} onClose={() => setPublishTarget(null)} onPublish={(classIds) => publish(publishTarget, classIds)} /> : null}{canAcademic && rescheduleTarget ? <RescheduleDialog lesson={rescheduleTarget} loading={loading} onClose={() => setRescheduleTarget(null)} onSave={(startAt, endAt, reason) => reschedule(rescheduleTarget, startAt, endAt, reason)} /> : null}{canSettle && settlementPreview ? <SettlementPreviewDialog lesson={actionTarget} onCancel={() => { setSettlementPreview(null); setActionTarget(null) }} onConfirm={() => { setSettlementPreview(null); setConfirmAction('settle') }} preview={settlementPreview} studentReferences={studentReferences} teacherReferences={referenceData.teachers} /> : null}{confirmAction && actionCopy && actionTarget ? <ConfirmDialog confirmLabel={actionCopy.confirmLabel} destructive={actionCopy.destructive} description={<><strong>{actionTarget.title}</strong><br />{actionCopy.description}</>} onCancel={() => { setConfirmAction(null); setActionTarget(null) }} onConfirm={() => void runConfirmedAction(actionTarget, confirmAction)} title={actionCopy.title} /> : null}</WorkspacePanel>
}

function LessonTable({ lessons, onEdit, onOpen, onPublish }: { lessons: Lesson[]; onEdit?: (lesson: Lesson) => void; onOpen: (lesson: Lesson) => void; onPublish?: (lesson: Lesson) => void }) { return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">课堂</th><th className="px-4 py-3">时间</th><th className="px-4 py-3">地点</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">每名学员</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{lessons.map((lesson) => <tr className="border-b border-[var(--border)] hover:bg-[var(--brand-wash)]" key={lesson.id}><td className="px-4 py-3"><p className="font-semibold">{lesson.title}</p><p className="text-xs text-[var(--muted-foreground)]">{lesson.code}</p></td><td className="px-4 py-3">{formatDateTime(lesson.startAt)}</td><td className="px-4 py-3">{lesson.location || '地点待定'}</td><td className="px-4 py-3"><Badge tone={lesson.status === 'settled' ? 'green' : lesson.status === 'cancelled' ? 'red' : 'blue'}>{statusLabel(lesson.status)}</Badge></td><td className="px-4 py-3">{lesson.requiredQuantity || 1} 课时</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><IconButton icon={<Eye className="h-4 w-4" />} label="课堂详情" onClick={() => void onOpen(lesson)} type="button" variant="ghost" />{onEdit && onPublish && lesson.status === 'draft' ? <><Button onClick={() => onEdit(lesson)} type="button" variant="secondary">编辑</Button><Button onClick={() => onPublish(lesson)} type="button">发布</Button></> : null}</div></td></tr>)}</tbody></DataTable> }
function LessonCard({ lesson, onOpen }: { lesson: Lesson; onOpen: () => void }) { return <article className="grid gap-3 px-4 py-4"><div className="flex justify-between"><div><h3 className="font-semibold">{lesson.title}</h3><p className="text-xs text-[var(--muted-foreground)]">{formatDateTime(lesson.startAt)} · {lesson.location || '地点待定'}</p></div><Badge tone="blue">{statusLabel(lesson.status)}</Badge></div><p className="text-sm text-[var(--muted-foreground)]">每名学员使用 {lesson.requiredQuantity || 1} 课时</p><Button onClick={onOpen} type="button" variant="secondary">课堂详情</Button></article> }

interface LessonDrawerProps {
  canAcademic: boolean
  canSettle: boolean
  canTeach: boolean
  lesson: Lesson
  loading: boolean
  onAllPresent: () => Promise<void>
  onAttendance: (record: CourseRecord, status: string) => Promise<void>
  onCancel: () => void
  onClose: () => void
  onComplete: () => void
  onPreviewSettlement: () => Promise<void>
  onReschedule: () => void
  onReverse: () => void
  onTeacher: (record: CourseRecord, status: string) => Promise<void>
  studentReferences: StudentRecord[]
  students: CourseRecord[]
  teacherId: string
  teacherReferences: BookingReferenceData['teachers']
  teachers: CourseRecord[]
}

function LessonDrawer({ canAcademic, canSettle, canTeach, lesson, loading, onAllPresent, onAttendance, onCancel, onClose, onComplete, onPreviewSettlement, onReschedule, onReverse, onTeacher, studentReferences, students, teacherId, teacherReferences, teachers }: LessonDrawerProps) {
  const canComplete = canAcademic && ['scheduled', 'enrollment_closed', 'in_progress'].includes(String(lesson.status))
  const canPreviewSettlement = canSettle && ['completed', 'cancelled', 'correction_pending'].includes(String(lesson.status))
  const teacherDescription = canAcademic ? '教务可维护全部实际授课教师' : canTeach ? '仅可确认本人的实际授课状态' : '仅查看核销所依据的实际授课状态'

  return <DrawerShell description={`${formatDateTime(lesson.startAt)} · ${lesson.location || '地点待定'}`} onRequestClose={onClose} size="wide" title={lesson.title}><div className="grid gap-6 p-5"><div className="flex flex-wrap gap-2">{canTeach ? <Button disabled={loading} onClick={() => void onAllPresent()} type="button">全部到课</Button> : null}{canAcademic ? <Button onClick={onReschedule} type="button" variant="secondary">调整时间</Button> : null}{canComplete ? <Button onClick={onComplete} type="button" variant="secondary">结束课堂</Button> : null}{canPreviewSettlement ? <Button onClick={() => void onPreviewSettlement()} type="button" variant="secondary">核销预览</Button> : null}{canSettle && lesson.status === 'settled' ? <Button onClick={onReverse} type="button" variant="danger">核销更正</Button> : null}{canAcademic ? <Button onClick={onCancel} type="button" variant="danger">取消课堂</Button> : null}</div><section className="grid gap-3"><SectionHeader description={`${students.length} 名学员`} title="出勤名单" />{students.map((student) => { const person = studentReferences.find((item) => item.id === String(student.studentId)); const name = personName(person, String(student.studentId)); return <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3" key={student.id}><div><p className="font-semibold">{name}</p><p className="text-xs text-[var(--muted-foreground)]">{person?.cellphone || '联系方式待补充'} · {creditStatusLabel(student.creditStatus)}</p></div><Select aria-label={`${name}出勤状态`} className="max-w-36" disabled={!canTeach} options={attendanceOptions} value={String(student.attendanceStatus || 'scheduled')} onChange={(event) => { if (canTeach && event.target.value !== 'scheduled') void onAttendance(student, event.target.value) }} /></div> })}</section><section className="grid gap-3"><SectionHeader description={teacherDescription} title="授课教师" />{teachers.map((teacher) => { const editable = canAcademic || (canTeach && teacher.teacherId === teacherId); const person = teacherReferences.find((item) => item.id === String(teacher.teacherId)); const name = personName(person, String(teacher.teacherId)); return <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3" key={teacher.id}><div><p className="font-semibold">{name}</p><p className="text-xs text-[var(--muted-foreground)]">{person?.cellphone || '联系方式待补充'} · {roleLabel(teacher.role)}</p></div><Select aria-label={`${name}实际授课状态`} className="max-w-36" disabled={!editable} options={[{ label: '待确认', value: 'pending' }, { label: '实际授课', value: 'confirmed' }, { label: '缺席', value: 'absent' }, { label: '取消', value: 'cancelled' }]} value={String(teacher.actualStatus || 'pending')} onChange={(event) => { if (editable && event.target.value !== 'pending') void onTeacher(teacher, event.target.value) }} /></div> })}</section><TechnicalDetails fields={[{ label: '课堂编号', value: lesson.id }, { label: '课堂版本', value: lesson.version }, { label: '名单版本', value: lesson.rosterVersion }, { label: '原始状态', value: lesson.status }]} /></div></DrawerShell>
}

function LessonEditor({ creditTypes, lesson, loading, onClose, onSave }: { creditTypes: BookingReferenceData['creditTypes']; lesson: Lesson | null; loading: boolean; onClose: () => void; onSave: (values: Partial<Lesson>) => Promise<void> }) {
  const [value, setValue] = useState<Partial<Lesson>>(lessonFormValue(lesson))
  const field = (key: keyof Lesson, label: string, type = 'text') => <Field htmlFor={`lesson-${key}`} label={label}><Input id={`lesson-${key}`} required type={type} value={String(value[key] ?? '')} onChange={(event) => setValue({ ...value, [key]: type === 'number' ? Number(event.target.value) : event.target.value })} /></Field>
  const creditOptions = creditTypes.map((item) => ({ value: item.id, label: item.name, description: item.unitLabel || item.code, keywords: `${item.name} ${item.code}` }))
  const valid = Boolean(value.title && value.code && value.startAt && value.endAt && value.location && value.requiredCreditTypeId && value.requiredQuantity)
  return <DialogShell description="课堂保存为草稿后，再选择班级发布名单。" onRequestClose={onClose} title={lesson ? '编辑课堂' : '新增课堂'}><form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (valid) void onSave(value) }}>{field('title', '课堂名称')}{field('code', '课堂编码')}{field('startAt', '开始时间', 'datetime-local')}{field('endAt', '结束时间', 'datetime-local')}{field('location', '上课地点')}<Field hint="每名学员上完本节课后使用的课时余额类型。" htmlFor="lesson-requiredCreditTypeId" label="扣减哪种课时"><ReferenceSelect emptyLabel="暂无可用课时类型" id="lesson-requiredCreditTypeId" onChange={(requiredCreditTypeId) => setValue({ ...value, requiredCreditTypeId })} options={creditOptions} placeholder="搜索课时类型" value={String(value.requiredCreditTypeId || '')} /></Field>{field('requiredQuantity', '每名学员使用课时', 'number')}<div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={loading || !valid} type="submit">保存草稿</Button></div></form></DialogShell>
}

function PublishDialog({ classes, lesson, loading, onClose, onPublish }: { classes: CourseRecord[]; lesson: Lesson; loading: boolean; onClose: () => void; onPublish: (classIds: string[]) => Promise<void> }) {
  const [classIds, setClassIds] = useState<string[]>([])
  const [candidate, setCandidate] = useState('')
  const available = classes.filter((item) => !classIds.includes(item.id)).map((item) => ({ value: item.id, label: String(item.name || item.code || '未命名班级'), description: [item.termStart && item.termEnd ? `${formatDate(item.termStart)} 至 ${formatDate(item.termEnd)}` : '', item.location].filter(Boolean).join(' · '), keywords: `${item.name || ''} ${item.code || ''}` }))
  return <DialogShell description="发布后会把所选班级当前的学员和教师加入课堂名单。" onRequestClose={onClose} size="medium" title={`发布 ${lesson.title}`}><form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); if (classIds.length) void onPublish(classIds) }}><Field htmlFor="publish-class" label="选择参与班级"><div className="flex gap-2"><ReferenceSelect aria-label="选择参与班级" emptyLabel="暂无其他可选班级" id="publish-class" onChange={setCandidate} options={available} placeholder="按班级名称搜索" value={candidate} /><Button disabled={!candidate} onClick={() => { setClassIds((current) => [...current, candidate]); setCandidate('') }} type="button" variant="secondary">加入</Button></div></Field><div className="grid gap-2">{classIds.map((classId) => { const item = classes.find((record) => record.id === classId); return <div className="flex items-center justify-between rounded-md border border-[var(--border)] p-3" key={classId}><div><strong>{String(item?.name || item?.code || '班级信息待补充')}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">{String(item?.location || '地点待定')}</p></div><Button aria-label={`移除${String(item?.name || '班级')}`} onClick={() => setClassIds((current) => current.filter((id) => id !== classId))} type="button" variant="ghost">移除</Button></div> })}{classIds.length === 0 ? <p className="rounded-md bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">至少选择一个班级后才能发布。</p> : null}</div><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={loading || classIds.length === 0} type="submit">发布课堂</Button></div></form></DialogShell>
}
function RescheduleDialog({ lesson, loading, onClose, onSave }: { lesson: Lesson; loading: boolean; onClose: () => void; onSave: (startAt: string, endAt: string, reason: string) => Promise<void> }) { const [startAt, setStartAt] = useState(lesson.startAt?.slice(0, 16) || ''); const [endAt, setEndAt] = useState(lesson.endAt?.slice(0, 16) || ''); const [reason, setReason] = useState('教学安排调整'); return <DialogShell onRequestClose={onClose} size="compact" title="调整课堂时间"><form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); void onSave(startAt, endAt, reason) }}><Field htmlFor="reschedule-start" label="新开始时间"><Input id="reschedule-start" required type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></Field><Field htmlFor="reschedule-end" label="新结束时间"><Input id="reschedule-end" required type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></Field><Field htmlFor="reschedule-reason" label="原因"><Input id="reschedule-reason" required value={reason} onChange={(event) => setReason(event.target.value)} /></Field><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={loading} type="submit">确认调整</Button></div></form></DialogShell> }
function SettlementPreviewDialog({ lesson, onCancel, onConfirm, preview, studentReferences, teacherReferences }: { lesson: Lesson | null; onCancel: () => void; onConfirm: () => void; preview: SettlementPreview; studentReferences: StudentRecord[]; teacherReferences: BookingReferenceData['teachers'] }) {
  const exceptions = preview.students?.filter((student) => student.exception) || []
  return <DialogShell description={`${lesson?.title || '当前课堂'} · ${statusLabel(preview.sessionStatus || 'completed')}。仅预览，不会写入数据。`} onRequestClose={onCancel} size="wide" title="课堂核销预览"><div className="grid gap-5 p-5"><SummaryBand><SummaryMetric label="学员课时变动" value={preview.students?.length || 0} /><SummaryMetric label="教师工作量" value={preview.teachers?.length || 0} /><SummaryMetric label="需要处理" value={exceptions.length} /></SummaryBand><section className="grid gap-3"><SectionHeader description="逐名确认使用课时和有效期；技术批次编号已收起。" title="学员课时变动" />{preview.students?.map((student) => { const person = studentReferences.find((item) => item.id === student.studentId); return <div className="grid gap-2 rounded-md border border-[var(--border)] p-3 text-sm" key={student.sessionStudentId}><div className="flex flex-wrap justify-between gap-2"><strong>{personName(person, student.studentId)}</strong><Badge tone={student.exception ? 'amber' : 'blue'}>{settlementActionLabel(student.action)} · {student.quantity} 课时</Badge></div>{student.allocations?.map((allocation) => <p className="text-[var(--muted-foreground)]" key={allocation.allocationId || allocation.batchId}>{allocation.quantity} 课时 · {allocation.effectiveExpiresAt ? `有效至 ${formatDate(allocation.effectiveExpiresAt)}` : '长期有效'}</p>)}{student.exception ? <p className="text-[var(--destructive)]">需要处理：{student.exception}</p> : null}<TechnicalDetails fields={[{ label: '课堂学员记录', value: student.sessionStudentId }, { label: '学员编号', value: student.studentId }, { label: '课时来源批次', value: student.allocations?.map((allocation) => ({ allocationId: allocation.allocationId, batchId: allocation.batchId })) }]} /></div> })}</section><section className="grid gap-3"><SectionHeader description="课堂核销后生成待确认的教师工作量。" title="教师工作量" />{preview.teachers?.map((teacher) => { const person = teacherReferences.find((item) => item.id === teacher.teacherId); return <div className="rounded-md border border-[var(--border)] p-3 text-sm" key={teacher.sessionTeacherId}><strong>{personName(person, teacher.teacherId)}</strong><p className="mt-1 text-[var(--muted-foreground)]">{roleLabel(teacher.role)} · {settlementActionLabel(teacher.action)} {teacher.quantity} 课时</p></div> })}</section><TechnicalDetails fields={[{ label: '课堂编号', value: preview.sessionId }, { label: '原始状态', value: preview.sessionStatus }]} /><div className="flex justify-end gap-2"><Button onClick={onCancel} type="button" variant="secondary">返回检查</Button><Button disabled={preview.canSettle === false} onClick={onConfirm} type="button">进入确认</Button></div></div></DialogShell>
}

function lessonActionCopy(action: LessonAction | null) {
  if (action === 'settle') return { confirmLabel: '确认核销', destructive: false, description: '核销会原子更新学员课时、教师工作量和课堂状态。', title: '确认课堂核销' }
  if (action === 'complete') return { confirmLabel: '确认结束', destructive: false, description: '结束课堂后才能进入核销流程，出勤和实际授课教师仍会保留。', title: '确认结束课堂' }
  if (action === 'reverse') return { confirmLabel: '确认更正', destructive: true, description: '该操作会保留原始事实并写入更正审计。', title: '确认核销更正' }
  if (action === 'cancel') return { confirmLabel: '确认取消', destructive: true, description: '取消课堂会保留排课记录并停止后续正常核销。', title: '确认取消课堂' }
  return null
}

const attendanceOptions = [{ label: '待上课', value: 'scheduled' }, { label: '到课', value: 'present' }, { label: '迟到', value: 'late' }, { label: '请假', value: 'leave' }, { label: '缺席', value: 'absent' }, { label: '取消', value: 'cancelled' }]
function settlementActionLabel(value: unknown) { return ({ consume: '扣减', reserve: '预留', release: '退回', reverse: '更正', earn: '记录工作量', confirm: '确认工作量' } as Record<string, string>)[String(value).toLowerCase()] || '记录变动' }
function lessonFormValue(lesson: Lesson | null): Partial<Lesson> { return lesson ? { code: lesson.code, title: lesson.title, startAt: lesson.startAt?.slice(0, 16), endAt: lesson.endAt?.slice(0, 16), location: lesson.location, requiredCreditTypeId: lesson.requiredCreditTypeId, requiredQuantity: lesson.requiredQuantity, status: lesson.status, rosterVersion: lesson.rosterVersion, version: lesson.version, attendanceRuleSnapshot: lesson.attendanceRuleSnapshot, settlementRuleSnapshot: lesson.settlementRuleSnapshot, teacherRuleSnapshot: lesson.teacherRuleSnapshot } : { status: 'draft', requiredQuantity: 1, rosterVersion: 1, version: 1, attendanceRuleSnapshot: { version: 1 }, settlementRuleSnapshot: { version: 1 }, teacherRuleSnapshot: { version: 1 } } }
function toIsoDate(value: unknown) { const date = new Date(String(value || '')); return Number.isNaN(date.getTime()) ? String(value || '') : date.toISOString() }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
