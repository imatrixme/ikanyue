import { ArrowLeft, Award, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import { creditStatusLabel, enrollmentStatusLabel, formatDateTime, personName, recordName, statusLabel } from '../../app/coursePresentation'
import type { CourseAccount, CourseRecord, EnrollmentOperation, Lesson } from '../../app/courseTypes'
import { viewPaths } from '../../app/navigation'
import type { StudentPointSummary, StudentRecord } from '../../app/types'
import { PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Button } from '../ui/Button'
import { AsyncState } from '../ui/DataDisplay'

interface StudentDetailData {
  account: CourseAccount
  audit: CourseRecord[]
  classCatalog: CourseRecord[]
  classes: CourseRecord[]
  enrollments: EnrollmentOperation[]
  lessonCatalog: Lesson[]
  packages: CourseRecord[]
  points: StudentPointSummary
  sessions: CourseRecord[]
  student?: StudentRecord
}

export function StudentDetailPage({ api, studentId, token }: { api: OpsApi; studentId: string; token: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<StudentDetailData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    const page = { page: 1, perPage: 100 }
    void Promise.all([
      api.getCourseResource<CourseAccount>(token, 'accounts', studentId),
      api.listCourseResource(token, 'classStudents', { ...page, studentId }),
      api.listCourseResource(token, 'sessionStudents', { ...page, studentId }),
      api.listCourseResource<EnrollmentOperation>(token, 'enrollments', { ...page, studentId }),
      api.listCourseResource(token, 'auditLogs', { page: 1, perPage: 20, resourceType: 'student', resourceId: studentId }),
      api.getStudentPoints(token, studentId),
      api.listCourseResource(token, 'classes', page),
      api.listCourseResource<Lesson>(token, 'lessons', page),
      api.listCourseResource(token, 'packages', page),
      api.listManagedStudents(token, page),
    ]).then(([account, classes, sessions, enrollments, audit, points, classCatalog, lessonCatalog, packages, students]) => {
      if (active) setData({ account, audit: audit.items, classCatalog: classCatalog.items, classes: classes.items, enrollments: enrollments.items, lessonCatalog: lessonCatalog.items, packages: packages.items, points, sessions: sessions.items, student: students.items.find((item) => item.id === studentId) })
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : '加载学员详情失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, studentId, token])

  const name = data?.student ? personName(data.student) : '学员详情'
  const lessonOf = (record: CourseRecord) => data?.lessonCatalog.find((lesson) => lesson.id === String(record.sessionId))
  const sessions = (data?.sessions || []).map((record) => ({ record, lesson: lessonOf(record) }))
  const upcoming = sessions
    .filter(({ lesson }) => lesson && Date.parse(lesson.startAt) >= now && lesson.status !== 'cancelled')
    .sort((a, b) => Date.parse(a.lesson!.startAt) - Date.parse(b.lesson!.startAt))
  const history = sessions
    .filter(({ lesson }) => !lesson || Date.parse(lesson.startAt) < now)
    .sort((a, b) => Date.parse(b.lesson?.startAt || '') - Date.parse(a.lesson?.startAt || ''))
    .slice(0, 10)

  return (
    <WorkspacePanel>
      <PageHeader
        actions={<>
          <Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(viewPaths.students)} type="button" variant="ghost">学员列表</Button>
          <Button icon={<Award className="h-4 w-4" />} onClick={() => navigate(viewPaths.points)} type="button" variant="secondary">积分</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`${viewPaths.enrollments}?new=1&studentId=${encodeURIComponent(studentId)}`)} type="button">报课/续课</Button>
        </>}
        title={name}
      />
      <AsyncState error={error} loading={loading} loadingLabel="正在加载学员详情...">
        {data ? <>
          <p className="border-b border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted-foreground)] sm:px-5">{data.student?.cellphone || '手机号待补充'} · {data.student?.blocked ? '账号已停用' : '账号正常'}</p>
          <SummaryBand>
            <SummaryMetric label="可用课时" value={data.account.availableQuantity} />
            <SummaryMetric label="已约未上" value={data.account.frozenQuantity} />
            <SummaryMetric label="已使用" value={data.account.consumedQuantity} />
            <SummaryMetric label="积分" value={data.points.balance} />
          </SummaryBand>
          <div className="grid gap-px bg-[var(--border)] lg:grid-cols-2 lg:[&>section:last-child:nth-child(odd)]:col-span-2">
            <DetailSection empty="没有待上的课" title="即将上课">
              {upcoming.map(({ record, lesson }) => <Row key={record.id} main={lesson!.title || recordName(lesson)} meta={formatDateTime(lesson!.startAt)} side={statusLabel(lesson!.status)} />)}
            </DetailSection>
            <DetailSection empty="还没有报课" title="报课记录">
              {data.enrollments.map((item) => <Row key={item.id} main={recordName(data.packages.find((record) => record.id === item.requestSnapshot?.packageId), item.requestSnapshot?.packageId, '课包')} meta={formatDateTime(item.created, '时间待补充')} side={enrollmentStatusLabel(item.resultSnapshot?.status || item.status)} />)}
            </DetailSection>
            <DetailSection empty="未加入班级" title="所在班级">
              {data.classes.map((item) => <Row key={item.id} main={recordName(data.classCatalog.find((record) => record.id === String(item.classId)), String(item.classId || ''), '班级')} side={statusLabel(item.status)} />)}
            </DetailSection>
            <DetailSection empty="还没有上过课" title="最近课堂">
              {history.map(({ record, lesson }) => <Row key={record.id} main={lesson?.title || recordName(lesson, String(record.sessionId || ''), '课堂')} meta={lesson ? formatDateTime(lesson.startAt) : undefined} side={`${statusLabel(record.attendanceStatus || 'scheduled')} · ${creditStatusLabel(record.creditStatus)}`} />)}
            </DetailSection>
            <DetailSection empty="没有操作记录" title="最近操作">
              {data.audit.map((item) => <Row key={item.id} main={String(item.action || '业务操作')} meta={formatDateTime(item.created, '')} side={statusLabel(item.outcome || 'succeeded')} />)}
            </DetailSection>
          </div>
        </> : null}
      </AsyncState>
    </WorkspacePanel>
  )
}

function DetailSection({ children, empty, title }: { children: React.ReactNode[]; empty: string; title: string }) {
  return <section aria-label={title} className="bg-[var(--card)] px-4 py-4 sm:px-5"><h2 className="text-sm font-semibold">{title}</h2><div className="mt-2 divide-y divide-[var(--border)]">{children.length ? children : <p className="py-2 text-sm text-[var(--muted-foreground)]">{empty}</p>}</div></section>
}

function Row({ main, meta, side }: { main: string; meta?: string; side: string }) {
  return <div className="flex items-baseline justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="truncate">{main}</p>{meta ? <p className="text-xs text-[var(--muted-foreground)]">{meta}</p> : null}</div><span className="shrink-0 text-xs text-[var(--muted-foreground)]">{side}</span></div>
}
