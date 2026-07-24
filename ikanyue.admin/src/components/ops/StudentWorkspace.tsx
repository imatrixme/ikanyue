import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import type { CourseAccount, CourseRecord, EnrollmentOperation } from '../../app/courseTypes'
import type { OpsProfile, StudentInput, StudentPointSummary, StudentRecord } from '../../app/types'
import { SummaryBand, SummaryMetric } from '../layout/Workspace'
import { Button } from '../ui/Button'
import { AsyncState } from '../ui/DataDisplay'
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

interface StudentOperations {
  account: CourseAccount
  classes: CourseRecord[]
  lessons: CourseRecord[]
  enrollments: EnrollmentOperation[]
  audit: CourseRecord[]
  points: StudentPointSummary
}

export function StudentWorkspace(props: StudentWorkspaceProps) {
  const [student, setStudent] = useState<StudentRecord | null>(null)
  return <><StudentsPanel canManage={props.profile.isAdmin} errorMessage={props.errorMessage} loading={props.loading} onOpenOperations={setStudent} onReload={props.onReload} onSave={props.onSave} students={props.students} />{student ? props.profile.isAdmin ? <StudentOperationsDrawer api={props.api} onClose={() => setStudent(null)} student={student} token={props.token} /> : <AssignedStudentDrawer onClose={() => setStudent(null)} student={student} /> : null}</>
}

function AssignedStudentDrawer({ onClose, student }: { onClose: () => void; student: StudentRecord }) {
  const classes = student.classAssignments || []
  const lessons = student.lessonAssignments || []
  return <DrawerShell description={`${student.cellphone} · 当前教师授课范围`} onRequestClose={onClose} size="wide" title={`${student.realName || student.nickName} · 授课关系`}><div className="grid gap-6 p-5"><SummaryBand><SummaryMetric label="关联班级" value={classes.length} /><SummaryMetric label="关联课堂" value={lessons.length} /></SummaryBand><RecordSection empty="暂无负责班级关系" records={classes} title="班级关系" value={(record) => `${record.classId} · ${record.status || 'active'}`} /><RecordSection empty="暂无负责课堂记录" records={lessons} title="课堂记录" value={(record) => `${record.sessionId} · ${record.attendanceStatus || '待上课'}`} /></div></DrawerShell>
}

function StudentOperationsDrawer({ api, onClose, student, token }: { api: OpsApi; onClose: () => void; student: StudentRecord; token: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<StudentOperations | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void Promise.all([
      api.getCourseResource<CourseAccount>(token, 'accounts', student.id),
      api.listCourseResource(token, 'classStudents', { studentId: student.id, page: 1, perPage: 100 }),
      api.listCourseResource(token, 'sessionStudents', { studentId: student.id, page: 1, perPage: 100 }),
      api.listCourseResource<EnrollmentOperation>(token, 'enrollments', { studentId: student.id, page: 1, perPage: 100 }),
      api.listCourseResource(token, 'auditLogs', { resourceType: 'student', resourceId: student.id, page: 1, perPage: 20 }),
      api.getStudentPoints(token, student.id),
    ]).then(([account, classes, lessons, enrollments, audit, points]) => {
      if (active) setData({ account, classes: classes.items, lessons: lessons.items, enrollments: enrollments.items, audit: audit.items, points })
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : '加载学员课程详情失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, student.id, token])

  return <DrawerShell description={`${student.cellphone} · ${student.blocked ? '停用' : '启用'}`} onRequestClose={onClose} size="wide" title={`${student.realName || student.nickName} · 课程与班级`}><AsyncState error={error} loading={loading} loadingLabel="正在加载学员课程详情..."><div className="grid gap-6 p-5">{data ? <><SummaryBand><SummaryMetric label="可用课时" value={data.account.availableQuantity} /><SummaryMetric label="已排课时" value={data.account.frozenQuantity} /><SummaryMetric label="积分" value={data.points.balance} /></SummaryBand><div className="flex flex-wrap gap-2"><Button onClick={() => { onClose(); navigate(`/enrollments?new=1&studentId=${encodeURIComponent(student.id)}`) }} type="button">为此学员报课</Button></div><RecordSection empty="暂无报课记录" records={data.enrollments} title="报课记录" value={(record) => `${record.operationNo} · ${record.resultSnapshot.status || record.status}`} /><RecordSection empty="暂未加入班级" records={data.classes} title="班级关系" value={(record) => `${record.classId} · ${record.status}`} /><RecordSection empty="暂无课堂记录" records={data.lessons} title="课堂记录" value={(record) => `${record.sessionId} · ${record.attendanceStatus || '待上课'} · ${record.creditStatus || '-'}`} /><RecordSection empty="暂无相关审计" records={data.audit} title="审计上下文" value={(record) => `${record.action} · ${record.outcome || '-'}`} /></> : null}</div></AsyncState></DrawerShell>
}

function RecordSection<T extends CourseRecord>({ empty, records, title, value }: { empty: string; records: T[]; title: string; value: (record: T) => string }) {
  return <section><h2 className="font-semibold">{title}</h2><div className="mt-3 grid gap-2">{records.map((record) => <p className="rounded-md border border-[var(--border)] p-3 text-sm" key={record.id}>{value(record)}</p>)}{records.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{empty}</p> : null}</div></section>
}
