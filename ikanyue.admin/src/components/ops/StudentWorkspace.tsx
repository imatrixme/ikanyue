import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import { personName, recordName, statusLabel } from '../../app/coursePresentation'
import type { CourseRecord } from '../../app/courseTypes'
import { viewPaths } from '../../app/navigation'
import type { OpsProfile, StudentInput, StudentRecord } from '../../app/types'
import { SummaryBand, SummaryMetric } from '../layout/Workspace'
import { DrawerShell } from '../ui/DrawerShell'
import { StudentsPanel } from './StudentsPanel'

interface StudentWorkspaceProps {
  api: OpsApi
  errorMessage?: string
  loading: boolean
  onReload: () => Promise<void>
  onSave: (id: string | null, payload: StudentInput) => Promise<boolean>
  profile: OpsProfile
  students: StudentRecord[]
  token: string
}

export function StudentWorkspace(props: StudentWorkspaceProps) {
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentRecord | null>(null)
  return <><StudentsPanel canManage={props.profile.isAdmin} errorMessage={props.errorMessage} loading={props.loading} onOpenOperations={props.profile.isAdmin ? (item) => navigate(`${viewPaths.students}/${encodeURIComponent(item.id)}`) : setStudent} onReload={props.onReload} onSave={props.onSave} students={props.students} />{student ? <AssignedStudentDrawer onClose={() => setStudent(null)} student={student} /> : null}</>
}

function AssignedStudentDrawer({ onClose, student }: { onClose: () => void; student: StudentRecord }) {
  const classes = student.classAssignments || []
  const lessons = student.lessonAssignments || []
  return <DrawerShell description={`${student.cellphone} · 当前教师授课范围`} onRequestClose={onClose} size="wide" title={`${personName(student)} · 授课关系`}><div className="grid gap-6 p-5"><SummaryBand><SummaryMetric label="关联班级" value={classes.length} /><SummaryMetric label="关联课堂" value={lessons.length} /></SummaryBand><RecordSection empty="暂无负责班级关系" records={classes} title="班级关系" value={(record) => `${relationName(record, 'classId', '班级')} · ${statusLabel(record.status || 'active')}`} /><RecordSection empty="暂无负责课堂记录" records={lessons} title="课堂记录" value={(record) => `${relationName(record, 'sessionId', '课堂')} · ${statusLabel(record.attendanceStatus || 'scheduled')}`} /></div></DrawerShell>
}

function RecordSection<T extends CourseRecord>({ empty, records, title, value }: { empty: string; records: T[]; title: string; value: (record: T) => string }) {
  return <section><h2 className="font-semibold">{title}</h2><div className="mt-3 grid gap-2">{records.map((record) => <p className="rounded-md border border-[var(--border)] p-3 text-sm" key={record.id}>{value(record)}</p>)}{records.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{empty}</p> : null}</div></section>
}

function relationName(record: CourseRecord, referenceKey: 'classId' | 'sessionId', noun: string) {
  return recordName({ ...record, id: String(record[referenceKey] || '') }, String(record[referenceKey] || ''), noun)
}
