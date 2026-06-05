import {
  ArrowRight,
  CalendarCheck2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { metricIconByKey } from '../../app/resourceConfig'
import type { AppView, AssessmentReport, DashboardData, ListResult, OpsProfile, ResourceLookup, ResourceRecord } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'

interface DashboardViewProps {
  data: DashboardData | null
  profile: OpsProfile
  resources?: ResourceLookup
  reports?: ListResult<AssessmentReport> | null
  onViewChange: (view: AppView) => void
}

export function DashboardView({ data, profile, resources = {}, reports = null, onViewChange }: DashboardViewProps) {
  return profile.isAdmin ? (
    <AdminDashboard data={data} resources={resources} onViewChange={onViewChange} />
  ) : (
    <TeacherDashboard resources={resources} reports={reports} onViewChange={onViewChange} profile={profile} />
  )
}

interface TeacherDashboardProps {
  profile: OpsProfile
  resources: ResourceLookup
  reports: ListResult<AssessmentReport> | null
  onViewChange: (view: AppView) => void
}

function TeacherDashboard({ resources, reports, onViewChange, profile }: TeacherDashboardProps) {
  const lessons = resources.learningSessions?.items || []
  const students = resources.students?.items || []
  const reportItems = reports?.items || []
  const nextLesson = lessons[0]
  const pendingReports = reportItems.filter((item) => item.status === 'draft' || item.status === 'open')

  return (
    <div className="grid gap-4">
      <DashboardHero
        eyebrow="Teacher workspace"
        title={`${profile.realName || profile.nickName || '老师'}，先处理今天的课`}
        description="老师端只保留上课、看学生、写反馈和查看报告，运营配置和关系表不作为日常入口。"
        badge="教师视图"
      />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <SectionHeader>
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-cyan-700" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">我的今天</h2>
                <p className="text-sm text-[var(--muted-foreground)]">从课次进入点名、确认老师和课后反馈。</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => onViewChange('lessonScenes')} icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
              进入课次
            </Button>
          </SectionHeader>
          <div className="grid gap-3 p-4">
            {nextLesson ? (
              <div className="rounded-md border border-cyan-200 bg-cyan-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-950">{recordTitle(nextLesson, '未命名课次')}</h3>
                    <p className="mt-1 text-sm text-cyan-900/75">{String(nextLesson.theme || '主题待定')} · {String(nextLesson.status || '状态待定')}</p>
                  </div>
                  <Badge tone="blue">下一堂课</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => onViewChange('lessonScenes')} icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}>处理出勤</Button>
                  <Button variant="secondary" onClick={() => onViewChange('assessmentWorkspace')} icon={<FileText className="h-4 w-4" aria-hidden="true" />}>写反馈</Button>
                </div>
              </div>
            ) : (
              <EmptyState title="今天还没有同步课次" description="有课次后，这里会优先显示老师下一步要处理的课程。" />
            )}
          </div>
        </Panel>

        <div className="grid gap-4">
          <QuickMetric label="待写反馈" value={pendingReports.length} icon={<FileText className="h-4 w-4" aria-hidden="true" />} onClick={() => onViewChange('assessmentWorkspace')} />
          <QuickMetric label="我的学生" value={students.length} icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />} onClick={() => onViewChange('students')} />
          <QuickMetric label="报告历史" value={reportItems.length} icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />} onClick={() => onViewChange('reports')} />
        </div>
      </div>
    </div>
  )
}

interface AdminDashboardProps {
  data: DashboardData | null
  resources: ResourceLookup
  onViewChange: (view: AppView) => void
}

function AdminDashboard({ data, resources, onViewChange }: AdminDashboardProps) {
  const cards = data?.cards || []
  const pending = data?.pending || []
  const signups = resources.activitySignups?.items || []
  const lessons = resources.learningSessions?.items || []
  const relationIssues = countRelationGaps(resources)

  return (
    <div className="grid gap-4">
      <DashboardHero
        eyebrow="Operations cockpit"
        title="教务运营驾驶舱"
        description="先看待处理事项，再进入活动转化、排课、课次和报告闭环；数据表保留为高级维护。"
        badge="管理员视图"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = metricIconByKey[card.key as keyof typeof metricIconByKey] || LayoutDashboard
          return (
            <Panel key={card.key} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--muted-foreground)]">{card.label}</span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--foreground)]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-5 text-3xl font-semibold tabular-nums">{card.value}</div>
            </Panel>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel>
          <SectionHeader>
            <div>
              <h2 className="font-semibold">今天先处理这些事</h2>
              <p className="text-sm text-[var(--muted-foreground)]">按真实运营动机进入，不要求管理员先理解底层数据表。</p>
            </div>
          </SectionHeader>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <AdminAction title="审核报名并转化" description={`${signups.length} 条报名可进入活动审核或转成项目/课次。`} icon={<Megaphone className="h-5 w-5" aria-hidden="true" />} onClick={() => onViewChange('activitySignups')} />
            <AdminAction title="排课与确认课次" description={`${lessons.length} 个课次需要确认时间、地点、老师和学生。`} icon={<CalendarCheck2 className="h-5 w-5" aria-hidden="true" />} onClick={() => onViewChange('lessonScenes')} />
            <AdminAction title="发起运营流程" description="创建活动、体验课、课程包、批量报告等复合动作。" icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />} onClick={() => onViewChange('guidedOps')} />
            <AdminAction title="检查关系缺口" description={`${relationIssues} 个项目或课次缺少学员/老师关系。`} icon={<Users className="h-5 w-5" aria-hidden="true" />} onClick={() => onViewChange('projectScenes')} />
          </div>
        </Panel>

        <Panel>
          <SectionHeader>
            <div>
              <h2 className="font-semibold">待处理</h2>
              <p className="text-sm text-[var(--muted-foreground)]">运营风险和闭环状态。</p>
            </div>
          </SectionHeader>
          <div className="grid gap-3 p-4">
            {pending.map((item) => <QuickMetric key={item.key} label={item.label} value={item.value} />)}
            <QuickMetric label="关系缺口" value={relationIssues} />
            <QuickMetric label="待审核报名" value={signups.filter((item) => item.status === 'registered').length} />
          </div>
        </Panel>
      </div>
    </div>
  )
}

function DashboardHero({ eyebrow, title, description, badge }: { eyebrow: string; title: string; description: string; badge: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-[var(--muted-foreground)]">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
      </div>
      <Badge tone="blue">{badge}</Badge>
    </div>
  )
}

function QuickMetric({ label, value, icon, onClick }: { label: string; value: number; icon?: ReactNode; onClick?: () => void }) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--muted-foreground)]">{label}</span>
        {icon ? <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--secondary)]">{icon}</span> : null}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
    </>
  )
  if (onClick) {
    return (
      <button className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-left shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/30" onClick={onClick} type="button">
        {content}
      </button>
    )
  }
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">{content}</div>
}

function AdminAction({ title, description, icon, onClick }: { title: string; description: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button className="group grid gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-cyan-200 hover:bg-cyan-50/35" onClick={onClick} type="button">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--foreground)] group-hover:bg-white">
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-[var(--muted-foreground)]">{description}</span>
      </span>
    </button>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] px-4 py-8 text-center">
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
    </div>
  )
}

function recordTitle(record: ResourceRecord, fallback: string) {
  return String(record.title || record.realName || record.nickName || record.name || fallback)
}

function countRelationGaps(resources: ResourceLookup) {
  const programStudentIds = new Set((resources.programStudents?.items || []).map((item) => String(item.programId)))
  const programTeacherIds = new Set((resources.programTeachers?.items || []).map((item) => String(item.programId)))
  const sessionStudentIds = new Set((resources.sessionStudents?.items || []).map((item) => String(item.sessionId)))
  const sessionTeacherIds = new Set((resources.sessionTeachers?.items || []).map((item) => String(item.sessionId)))
  const programGaps = (resources.learningPrograms?.items || []).filter((item) => !programStudentIds.has(String(item.id)) || !programTeacherIds.has(String(item.id))).length
  const sessionGaps = (resources.learningSessions?.items || []).filter((item) => !sessionStudentIds.has(String(item.id)) || !sessionTeacherIds.has(String(item.id))).length
  return programGaps + sessionGaps
}
