import {
  ArrowRight,
  BookOpenCheck,
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
        description="老师端从今天的课堂、相关学生、待写反馈和报告记录进入，不要求理解后台数据结构。"
        badge="教师视图"
      />
      <div className="grid gap-3 md:grid-cols-3">
        <WorkQueueCard
          title="今日课堂"
          value={lessons.length}
          description={nextLesson ? recordTitle(nextLesson, '未命名课堂') : '暂无同步课堂'}
          actionLabel="进入课堂"
          icon={<CalendarCheck2 className="h-4 w-4" aria-hidden="true" />}
          onClick={() => onViewChange('lessonScenes')}
        />
        <WorkQueueCard
          title="待写反馈"
          value={pendingReports.length}
          description={pendingReports.length ? '有报告或反馈仍在草稿/收集中' : '当前没有待写反馈'}
          actionLabel="填写测评"
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          onClick={() => onViewChange('assessmentWorkspace')}
        />
        <WorkQueueCard
          title="我的学员"
          value={students.length}
          description={students.length ? '查看课堂相关学生资料和学习记录' : '暂无可见学员'}
          actionLabel="查看档案"
          icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
          onClick={() => onViewChange('students')}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <SectionHeader>
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-cyan-700" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">下一堂课堂</h2>
                <p className="text-sm text-[var(--muted-foreground)]">从课堂进入点名、查看学生和课后反馈。</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => onViewChange('lessonScenes')} icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
              进入课堂
            </Button>
          </SectionHeader>
          <div className="grid gap-3 p-4">
            {nextLesson ? (
              <div className="rounded-md border border-cyan-200 bg-cyan-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-950">{recordTitle(nextLesson, '未命名课堂')}</h3>
                    <p className="mt-1 text-sm text-cyan-900/75">{String(nextLesson.theme || '主题待定')} · {String(nextLesson.status || '状态待定')}</p>
                  </div>
                  <Badge tone="blue">下一堂课堂</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => onViewChange('lessonScenes')} icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}>处理出勤</Button>
                  <Button variant="secondary" onClick={() => onViewChange('assessmentWorkspace')} icon={<FileText className="h-4 w-4" aria-hidden="true" />}>写反馈</Button>
                </div>
              </div>
            ) : (
              <EmptyState title="今天还没有同步课堂" description="有课堂后，这里会优先显示老师下一步要处理的上课事项。" />
            )}
          </div>
        </Panel>

        <div className="grid gap-4">
          <QuickMetric label="待写反馈" value={pendingReports.length} icon={<FileText className="h-4 w-4" aria-hidden="true" />} onClick={() => onViewChange('assessmentWorkspace')} />
          <QuickMetric label="我的学生" value={students.length} icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />} onClick={() => onViewChange('students')} />
          <QuickMetric label="已生成报告" value={reportItems.length} icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />} onClick={() => onViewChange('reports')} />
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
  const activities = resources.activities?.items || []
  const lessons = resources.learningSessions?.items || []
  const reportEvents = resources.reportEvents?.items || []
  const reportInstances = resources.reportInstances?.items || []
  const operationSlots = resources.operationSlots?.items || []
  const audioMaterials = resources.audioMaterials?.items || []
  const videoMaterials = resources.videoMaterials?.items || []
  const relationIssues = countRelationGaps(resources)
  const lifecycleQueues = buildAdminQueues({
    signups,
    activities,
    lessons,
    relationIssues,
    reportEvents,
    reportInstances,
    operationSlots,
    audioMaterials,
    videoMaterials,
    onViewChange,
  })

  return (
    <div className="grid gap-4">
      <DashboardHero
        eyebrow="Operations cockpit"
        title="今天先把教务闭环推进"
        description="按招生、转化、排课、上课、报告和小程序展示的顺序处理事项；数据中心只作为检查和修复入口。"
        badge="管理员视图"
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel>
          <SectionHeader>
            <div>
              <h2 className="font-semibold">生命周期待办</h2>
              <p className="text-sm text-[var(--muted-foreground)]">从真实工作阶段进入，系统把底层数据关系留到后台生成和维护。</p>
            </div>
          </SectionHeader>
          <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
            {lifecycleQueues.map((queue) => (
              <WorkQueueCard key={queue.title} {...queue} />
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionHeader>
            <div>
              <h2 className="font-semibold">运营摘要</h2>
              <p className="text-sm text-[var(--muted-foreground)]">指标和风险只作为判断依据。</p>
            </div>
          </SectionHeader>
          <div className="grid gap-3 p-4">
            {pending.map((item) => <QuickMetric key={item.key} label={item.label} value={item.value} />)}
            <QuickMetric label="关系缺口" value={relationIssues} />
            <QuickMetric label="待审核报名" value={signups.filter((item) => item.status === 'registered').length} />
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionHeader>
          <div>
            <h2 className="font-semibold">规模指标</h2>
            <p className="text-sm text-[var(--muted-foreground)]">用于判断运营体量，不作为主要操作入口。</p>
          </div>
        </SectionHeader>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = metricIconByKey[card.key as keyof typeof metricIconByKey] || LayoutDashboard
            return (
              <div key={card.key} className="rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--muted-foreground)]">{card.label}</span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--foreground)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-5 text-3xl font-semibold tabular-nums">{card.value}</div>
              </div>
            )
          })}
        </div>
      </Panel>
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

function WorkQueueCard({
  title,
  value,
  description,
  actionLabel,
  icon,
  onClick,
}: {
  title: string
  value: number
  description: string
  actionLabel: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button className="group rounded-md border border-[var(--border)] bg-[var(--card)] p-4 text-left shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/35" onClick={onClick} type="button">
      <span className="flex items-start justify-between gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--foreground)] group-hover:bg-white">
          {icon}
        </span>
        <Badge tone={value > 0 ? 'amber' : 'green'}>{value > 0 ? `${value} 项` : '清空'}</Badge>
      </span>
      <span className="mt-3 block font-semibold">{title}</span>
      <span className="mt-1 block min-h-10 text-sm leading-5 text-[var(--muted-foreground)]">{description}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-800">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
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

function buildAdminQueues({
  signups,
  activities,
  lessons,
  relationIssues,
  reportEvents,
  reportInstances,
  operationSlots,
  audioMaterials,
  videoMaterials,
  onViewChange,
}: {
  signups: ResourceRecord[]
  activities: ResourceRecord[]
  lessons: ResourceRecord[]
  relationIssues: number
  reportEvents: ResourceRecord[]
  reportInstances: ResourceRecord[]
  operationSlots: ResourceRecord[]
  audioMaterials: ResourceRecord[]
  videoMaterials: ResourceRecord[]
  onViewChange: (view: AppView) => void
}) {
  const pendingSignups = signups.filter((item) => item.status === 'registered')
  const conversionReady = signups.filter((item) => item.status === 'attended')
  const draftActivities = activities.filter((item) => item.status === 'draft')
  const scheduledLessons = lessons.filter((item) => item.status === 'planned')
  const openReportTasks = reportEvents.filter((item) => item.status === 'open' || item.status === 'draft')
  const draftReports = reportInstances.filter((item) => item.status === 'draft')
  const inactiveSlots = operationSlots.filter((item) => item.status !== 'active')
  const draftMaterials = [...audioMaterials, ...videoMaterials].filter((item) => item.status === 'draft')

  return [
    {
      title: '发布招生活动',
      value: draftActivities.length,
      description: draftActivities.length ? `${recordTitle(draftActivities[0], '未命名活动')} 等活动还在草稿。` : '当前没有待发布的招生活动。',
      actionLabel: '进入招生活动',
      icon: <Megaphone className="h-4 w-4" aria-hidden="true" />,
      onClick: () => onViewChange('activities'),
    },
    {
      title: '处理报名转化',
      value: pendingSignups.length + conversionReady.length,
      description: pendingSignups.length ? `${pendingSignups.length} 条报名待审核。` : conversionReady.length ? `${conversionReady.length} 条到场报名可转班。` : '当前没有待处理报名。',
      actionLabel: '进入报名处理',
      icon: <ClipboardCheck className="h-4 w-4" aria-hidden="true" />,
      onClick: () => onViewChange('activitySignups'),
    },
    {
      title: '确认班级关系',
      value: relationIssues,
      description: relationIssues ? `${relationIssues} 个班级或课堂缺少学员/老师关系。` : '班级和课堂关系暂未发现缺口。',
      actionLabel: '进入班级工作台',
      icon: <Users className="h-4 w-4" aria-hidden="true" />,
      onClick: () => onViewChange('projectScenes'),
    },
    {
      title: '排课与上课',
      value: scheduledLessons.length,
      description: scheduledLessons.length ? `${recordTitle(scheduledLessons[0], '未命名课堂')} 等课堂等待确认。` : '没有计划中的课堂需要处理。',
      actionLabel: '进入课堂工作台',
      icon: <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />,
      onClick: () => onViewChange('lessonScenes'),
    },
    {
      title: '发起/收口报告',
      value: openReportTasks.length + draftReports.length,
      description: openReportTasks.length ? `${openReportTasks.length} 个报告任务仍在推进。` : draftReports.length ? `${draftReports.length} 份报告结果仍是草稿。` : '当前没有待处理报告任务。',
      actionLabel: '进入测评报告',
      icon: <FileText className="h-4 w-4" aria-hidden="true" />,
      onClick: () => onViewChange('reports'),
    },
    {
      title: '小程序展示准备',
      value: inactiveSlots.length + draftMaterials.length,
      description: inactiveSlots.length ? `${inactiveSlots.length} 个投放位未启用。` : draftMaterials.length ? `${draftMaterials.length} 个素材仍是草稿。` : '内容和投放位没有待上架项。',
      actionLabel: '进入内容与小程序',
      icon: <BookOpenCheck className="h-4 w-4" aria-hidden="true" />,
      onClick: () => onViewChange('operationSlots'),
    },
  ]
}
