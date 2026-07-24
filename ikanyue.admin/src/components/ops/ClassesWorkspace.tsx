import { Eye, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import type { CourseRecord, CourseResourceInput, TeachingClass } from '../../app/courseTypes'
import type { StudentRecord } from '../../app/types'
import { PageHeader, SectionHeader, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { DrawerShell } from '../ui/DrawerShell'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface ClassesWorkspaceProps { api: OpsApi; token: string }

export function ClassesWorkspace({ api, token }: ClassesWorkspaceProps) {
  const navigate = useNavigate()
  const [classes, setClasses] = useState<TeachingClass[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [selected, setSelected] = useState<TeachingClass | null>(null)
  const [relations, setRelations] = useState({ students: [] as CourseRecord[], teachers: [] as CourseRecord[], lessons: [] as CourseRecord[] })
  const [editor, setEditor] = useState<TeachingClass | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [classPage, studentPage] = await Promise.all([
        api.listCourseResource<TeachingClass>(token, 'classes', { page: 1, perPage: 100 }),
        api.listManagedStudents(token, { page: 1, perPage: 100 }),
      ])
      setClasses(classPage.items)
      setStudents(studentPage.items)
    } catch (loadError) { setError(message(loadError, '加载班级失败')) }
    finally { setLoading(false) }
  }, [api, token])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function openClass(classRecord: TeachingClass) {
    setSelected(classRecord)
    setLoading(true)
    try {
      const [members, teachers, links] = await Promise.all([
        api.listCourseResource(token, 'classStudents', { classId: classRecord.id, page: 1, perPage: 100 }),
        api.listCourseResource(token, 'classTeachers', { classId: classRecord.id, page: 1, perPage: 100 }),
        api.listCourseResource(token, 'sessionClasses', { classId: classRecord.id, page: 1, perPage: 100 }),
      ])
      const lessons = await Promise.all(links.items.map((link) => api.getCourseResource(token, 'lessons', String(link.sessionId))))
      setRelations({ students: members.items, teachers: teachers.items, lessons })
    } catch (detailError) { setError(message(detailError, '加载班级详情失败')) }
    finally { setLoading(false) }
  }

  async function saveClass(values: Partial<TeachingClass>) {
    setLoading(true)
    const data: CourseResourceInput = {
      code: values.code, name: values.name, courseSpecId: values.courseSpecId,
      defaultCreditTypeId: values.defaultCreditTypeId, termStart: values.termStart,
      termEnd: values.termEnd, capacity: values.capacity, location: values.location,
      status: values.status || 'draft',
    }
    try {
      if (editor?.id) await api.updateCourseResource(token, 'classes', editor.id, data)
      else await api.createCourseResource(token, 'classes', data)
      setEditor(undefined)
      await load()
    } catch (saveError) { setError(message(saveError, '保存班级失败')); setLoading(false) }
  }

  async function addStudent(classRecord: TeachingClass, studentId: string) {
    await api.setClassMembership(token, classRecord.id, studentId, 'active')
    await openClass(classRecord)
  }

  async function removeStudent(classRecord: TeachingClass, studentId: string) {
    await api.setClassMembership(token, classRecord.id, studentId, 'cancelled')
    await openClass(classRecord)
  }

  async function transferStudent(classRecord: TeachingClass, studentId: string, targetClassId: string) {
    await api.transferClassStudent(token, classRecord.id, studentId, targetClassId)
    await openClass(classRecord)
  }

  async function assignTeacher(classRecord: TeachingClass, teacherId: string, role: string) {
    await api.setClassTeacher(token, classRecord.id, teacherId, role, 'active')
    await openClass(classRecord)
  }

  return <WorkspacePanel><PageHeader actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="重新加载班级" onClick={() => void load()} type="button" /><IconButton icon={<Plus className="h-4 w-4" />} label="新增班级" onClick={() => setEditor(null)} type="button" variant="primary" /></>} badge={<Badge tone="green">{classes.filter((item) => item.status === 'active').length} 个进行中</Badge>} description="维护班级学期、成员、授课教师和已发布未来课堂。" eyebrow="教学组织" title="班级管理" /><AsyncState empty={classes.length === 0 ? <EmptyState noun="班级" onCreate={() => setEditor(null)} /> : undefined} error={error} loading={loading && classes.length === 0} loadingLabel="正在加载班级..." onRetry={() => void load()}><ResponsiveDataRegion desktop={<ClassTable classes={classes} onEdit={setEditor} onOpen={openClass} />} mobile={classes.map((item) => <ClassCard item={item} key={item.id} onEdit={() => setEditor(item)} onOpen={() => void openClass(item)} />)} /></AsyncState>{selected ? <ClassDrawer allClasses={classes} classRecord={selected} loading={loading} onAddStudent={(studentId) => addStudent(selected, studentId)} onAssignTeacher={(teacherId, role) => assignTeacher(selected, teacherId, role)} onClose={() => setSelected(null)} onEnroll={() => navigate(`/enrollments?new=1&classId=${encodeURIComponent(selected.id)}`)} onRemoveStudent={(studentId) => removeStudent(selected, studentId)} onTransferStudent={(studentId, targetClassId) => transferStudent(selected, studentId, targetClassId)} relations={relations} students={students} /> : null}{editor !== undefined ? <ClassEditor classRecord={editor} loading={loading} onClose={() => setEditor(undefined)} onSave={saveClass} /> : null}</WorkspacePanel>
}

function ClassTable({ classes, onEdit, onOpen }: { classes: TeachingClass[]; onEdit: (item: TeachingClass) => void; onOpen: (item: TeachingClass) => void }) {
  return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">班级</th><th className="px-4 py-3">学期</th><th className="px-4 py-3">容量</th><th className="px-4 py-3">地点</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{classes.map((item) => <tr className="border-b border-[var(--border)] hover:bg-[var(--brand-wash)]" key={item.id}><td className="px-4 py-3"><p className="font-semibold">{item.name}</p><p className="text-xs text-[var(--muted-foreground)]">{item.code}</p></td><td className="px-4 py-3">{item.termStart} 至 {item.termEnd}</td><td className="px-4 py-3">{item.capacity} 人</td><td className="px-4 py-3">{item.location || '-'}</td><td className="px-4 py-3"><Badge tone={item.status === 'active' ? 'green' : 'neutral'}>{item.status}</Badge></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><IconButton icon={<Eye className="h-4 w-4" />} label="班级详情" onClick={() => void onOpen(item)} type="button" variant="ghost" /><IconButton icon={<Pencil className="h-4 w-4" />} label="编辑班级" onClick={() => onEdit(item)} type="button" variant="secondary" /></div></td></tr>)}</tbody></DataTable>
}

function ClassCard({ item, onEdit, onOpen }: { item: TeachingClass; onEdit: () => void; onOpen: () => void }) { return <article className="grid gap-3 px-4 py-4"><div className="flex justify-between"><div><h3 className="font-semibold">{item.name}</h3><p className="text-xs text-[var(--muted-foreground)]">{item.code} · {item.location}</p></div><Badge tone={item.status === 'active' ? 'green' : 'neutral'}>{item.status}</Badge></div><p className="text-sm">{item.termStart} 至 {item.termEnd} · 容量 {item.capacity} 人</p><div className="flex gap-2"><Button onClick={onOpen} type="button" variant="secondary">详情</Button><Button onClick={onEdit} type="button" variant="secondary">编辑</Button></div></article> }

function ClassDrawer({ allClasses, classRecord, loading, onAddStudent, onAssignTeacher, onClose, onEnroll, onRemoveStudent, onTransferStudent, relations, students }: { allClasses: TeachingClass[]; classRecord: TeachingClass; loading: boolean; onAddStudent: (studentId: string) => Promise<void>; onAssignTeacher: (teacherId: string, role: string) => Promise<void>; onClose: () => void; onEnroll: () => void; onRemoveStudent: (studentId: string) => Promise<void>; onTransferStudent: (studentId: string, targetClassId: string) => Promise<void>; relations: { students: CourseRecord[]; teachers: CourseRecord[]; lessons: CourseRecord[] }; students: StudentRecord[] }) {
  const [studentId, setStudentId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [teacherRole, setTeacherRole] = useState('lead')
  return <DrawerShell description={`${classRecord.termStart} 至 ${classRecord.termEnd} · ${classRecord.location || '地点待定'}`} onRequestClose={onClose} size="wide" title={classRecord.name}><div className="grid gap-6 p-5"><div className="flex flex-wrap gap-2"><Button onClick={onEnroll} type="button">为班级报课</Button></div><section className="grid gap-3"><SectionHeader description={`${relations.students.length}/${classRecord.capacity} 人`} title="班级成员" /><div className="flex gap-2"><Select options={students.map((item) => ({ label: `${item.realName || item.nickName} · ${item.cellphone}`, value: item.id }))} value={studentId} onChange={(event) => setStudentId(event.target.value)} /><Button disabled={!studentId || loading} onClick={() => void onAddStudent(studentId)} type="button">加入</Button></div>{relations.students.map((member) => <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3" key={member.id}><div><p className="font-semibold">学员 {String(member.studentId)}</p><p className="text-xs text-[var(--muted-foreground)]">{String(member.status || '')}</p></div><div className="flex gap-2"><select aria-label="转入班级" className="h-9 rounded-md border border-[var(--input)] px-2 text-xs" defaultValue="" onChange={(event) => { if (event.target.value) void onTransferStudent(String(member.studentId), event.target.value); event.target.value = '' }}><option value="" disabled>转班</option>{allClasses.filter((item) => item.id !== classRecord.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button onClick={() => void onRemoveStudent(String(member.studentId))} type="button" variant="danger">移除</Button></div></div>)}</section><section className="grid gap-3"><SectionHeader title="授课教师" /><div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"><Input aria-label="教师编号" placeholder="教师编号" value={teacherId} onChange={(event) => setTeacherId(event.target.value)} /><Select options={[{ label: '主教', value: 'lead' }, { label: '助教', value: 'assistant' }, { label: '观察', value: 'observer' }, { label: '评估', value: 'evaluator' }]} value={teacherRole} onChange={(event) => setTeacherRole(event.target.value)} /><Button disabled={!teacherId || loading} onClick={() => void onAssignTeacher(teacherId, teacherRole)} type="button">分配</Button></div>{relations.teachers.map((teacher) => <p className="rounded-md border border-[var(--border)] p-3 text-sm" key={teacher.id}>教师 {String(teacher.teacherId)} · {String(teacher.role)} · {String(teacher.status)}</p>)}</section><section className="grid gap-3"><SectionHeader title="未来课堂" />{relations.lessons.map((lesson) => <p className="rounded-md border border-[var(--border)] p-3 text-sm" key={lesson.id}>{String(lesson.title || lesson.code)} · {formatDate(String(lesson.startAt || ''))} · {String(lesson.status)}</p>)}{relations.lessons.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">暂无关联课堂。</p> : null}</section></div></DrawerShell>
}

function ClassEditor({ classRecord, loading, onClose, onSave }: { classRecord: TeachingClass | null; loading: boolean; onClose: () => void; onSave: (values: Partial<TeachingClass>) => Promise<void> }) {
  const [value, setValue] = useState<Partial<TeachingClass>>(classRecord || { capacity: 12, status: 'draft' })
  const field = (key: keyof TeachingClass, label: string, type = 'text') => <Field htmlFor={`class-${key}`} label={label}><Input id={`class-${key}`} required type={type} value={String(value[key] ?? '')} onChange={(event) => setValue({ ...value, [key]: type === 'number' ? Number(event.target.value) : event.target.value })} /></Field>
  return <DialogShell onRequestClose={onClose} title={classRecord ? '编辑班级' : '新增班级'}><form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void onSave(value) }}>{field('name', '班级名称')}{field('code', '班级编码')}{field('courseSpecId', '课程规格编号')}{field('defaultCreditTypeId', '默认课时类型编号')}{field('termStart', '学期开始', 'date')}{field('termEnd', '学期结束', 'date')}{field('capacity', '容量', 'number')}{field('location', '地点')}<div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={loading} type="submit">保存</Button></div></form></DialogShell>
}

function formatDate(value: string) { if (!value) return '时间待定'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }) }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
