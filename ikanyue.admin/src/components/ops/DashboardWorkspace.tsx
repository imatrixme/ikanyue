import { ArrowRight, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import type { CourseCapability, CourseRecord, EnrollmentOperation, Lesson } from '../../app/courseTypes'
import type { OpsProfile } from '../../app/types'
import { PageHeader, SectionHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState } from '../ui/DataDisplay'

interface DashboardData {
  lessons: Lesson[]
  enrollments: EnrollmentOperation[]
  accounts: CourseRecord[]
  teacherEvents: CourseRecord[]
  settlementExceptions: CourseRecord[]
  reconciliationExceptions: CourseRecord[]
}

export function DashboardWorkspace({ api, profile, token }: { api: OpsApi; profile: OpsProfile; token: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const capabilities = new Set(profile.courseCreditCapabilities || [])
      const allowed = (capability: CourseCapability) => profile.isAdmin || capabilities.has(capability)
      const page = { page: 1, perPage: 100 }
      const lessonResource = allowed('course_credit.academic') || allowed('course_credit.settlement') ? 'lessons' : 'assignedLessons'
      const [lessons, enrollments, accounts, teacherEvents, settlementExceptions, reconciliationExceptions] = await Promise.all([
        allowed('course_credit.academic') || allowed('course_credit.teacher') || allowed('course_credit.settlement') ? api.listCourseResource<Lesson>(token, lessonResource, page) : emptyPage<Lesson>(),
        allowed('course_credit.finance') ? api.listCourseResource<EnrollmentOperation>(token, 'enrollments', page) : emptyPage<EnrollmentOperation>(),
        allowed('course_credit.finance') ? api.listCourseResource(token, 'accounts', page) : emptyPage<CourseRecord>(),
        allowed('course_credit.teacher') ? api.listCourseResource(token, 'teacherEvents', page) : emptyPage<CourseRecord>(),
        allowed('course_credit.settlement') ? api.listCourseResource(token, 'settlementExceptions', page) : emptyPage<CourseRecord>(),
        allowed('course_credit.audit') ? api.listCourseResource(token, 'reconciliationExceptions', page) : emptyPage<CourseRecord>(),
      ])
      setData({ accounts: accounts.items, enrollments: enrollments.items, lessons: lessons.items, reconciliationExceptions: reconciliationExceptions.items, settlementExceptions: settlementExceptions.items, teacherEvents: teacherEvents.items })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载运营工作台失败')
    } finally {
      setLoading(false)
    }
  }, [api, profile.courseCreditCapabilities, profile.isAdmin, token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const todayLessons = data?.lessons.filter((lesson) => lesson.startAt?.startsWith(today)) || []
  const syncQueue = data?.enrollments.filter((item) => item.resultSnapshot.status === 'synchronizing_future_lessons') || []
  const insufficient = data?.accounts.filter((item) => Number(item.availableQuantity || 0) <= 0) || []
  const settlements = data?.lessons.filter((lesson) => ['completed', 'correction_pending'].includes(String(lesson.status))) || []
  const expiry = data?.accounts.filter((item) => Number(item.expiredQuantity || 0) > 0) || []
  const teacherPending = data?.teacherEvents.filter((item) => item.status === 'pending') || []
  const exceptions = [...(data?.settlementExceptions || []), ...(data?.reconciliationExceptions || [])]
  const capabilities = new Set(profile.courseCreditCapabilities || [])
  const allowed = (capability: CourseCapability) => profile.isAdmin || capabilities.has(capability)

  return <WorkspacePanel><PageHeader actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新今日工作台" onClick={() => void load()} type="button" />} badge={<Badge tone={exceptions.length ? 'amber' : 'green'}>{exceptions.length} 个异常</Badge>} description="只展示当前账号获授权的课程运营队列。" eyebrow="运营总览" title="今日工作台" /><SummaryBand>{allowed('course_credit.academic') || allowed('course_credit.teacher') || allowed('course_credit.settlement') ? <SummaryMetric label="今日课堂" value={todayLessons.length} /> : null}{allowed('course_credit.finance') ? <SummaryMetric label="待名单同步" value={syncQueue.length} /> : null}{allowed('course_credit.settlement') ? <SummaryMetric label="待核销" value={settlements.length} /> : null}{allowed('course_credit.teacher') ? <SummaryMetric label="待确认工作量" value={teacherPending.length} /> : null}</SummaryBand><AsyncState error={error} loading={loading && !data} loadingLabel="正在加载运营队列..." onRetry={() => void load()}><div className="grid gap-px bg-[var(--border)] md:grid-cols-2 xl:grid-cols-3">{allowed('course_credit.academic') || allowed('course_credit.teacher') || allowed('course_credit.settlement') ? <Queue title="今日课堂" count={todayLessons.length} description="查看课堂名单、出勤与实际教师" onOpen={() => navigate('/lessons')} /> : null}{allowed('course_credit.finance') ? <><Queue title="报课名单同步" count={syncQueue.length} description="预览后显式修正已发布课堂名单" onOpen={() => navigate('/enrollments')} /><Queue title="课时不足" count={insufficient.length} description="需要教务联系或补充报课" onOpen={() => navigate('/lesson-hours')} /><Queue title="有效期提醒" count={expiry.length} description="检查失效批次与后续安排" onOpen={() => navigate('/lesson-hours')} /></> : null}{allowed('course_credit.settlement') ? <Queue title="核销与更正" count={settlements.length} description="先预览，再确认原子核销" onOpen={() => navigate('/lessons')} /> : null}{allowed('course_credit.teacher') ? <Queue title="教师工作量" count={teacherPending.length} description="查看本人待确认的课堂工作量" onOpen={() => navigate('/teacher-workload')} /> : null}{allowed('course_credit.settlement') || allowed('course_credit.audit') ? <Queue title="异常中心" count={exceptions.length} description="核销与对账差异集中处理" onOpen={() => navigate('/exceptions')} /> : null}</div></AsyncState></WorkspacePanel>
}

function emptyPage<T>() { return Promise.resolve({ items: [] as T[], page: 1, perPage: 100, totalItems: 0, totalPages: 0 }) }

function Queue({ count, description, onOpen, title }: { count: number; description: string; onOpen: () => void; title: string }) {
  return <section className="grid min-h-40 content-between gap-4 bg-[var(--card)] p-5"><SectionHeader actions={<Badge tone={count ? 'amber' : 'green'}>{count}</Badge>} description={description} title={title} /><Button icon={<ArrowRight className="h-4 w-4" />} onClick={onOpen} type="button" variant="secondary">进入处理</Button></section>
}
