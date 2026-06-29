import { CheckCircle2, ChevronDown, FileClock, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { guidedWorkflows, workflowById } from '../../app/guidedWorkflows'
import type { GuidedPlan, GuidedWorkflow, GuidedAnswers } from '../../app/guidedWorkflows'
import { createGuidedWorkflowDraft, loadGuidedWorkflowDrafts, persistGuidedWorkflowDraft, removeGuidedWorkflowDraft, type GuidedWorkflowDraft } from '../../app/guidedWorkflowDrafts'
import type { ResourceLookup } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'
import { PageHeader } from '../ui/PageHeader'
import { MetricTile, SemanticSurface } from '../ui/SemanticSurface'
import { semanticTone, type SemanticTone } from '../ui/semanticTone'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'
import { cn } from '../ui/utils'
import { GuidedCreateDialog } from './GuidedCreateDialog'

interface GuidedOpsWorkspaceProps {
  resources?: ResourceLookup
  submitting?: boolean
  onSubmitPlan: (plan: GuidedPlan, answers: GuidedAnswers) => void
  onUploadRichTextImage?: (file: File) => Promise<string>
}

const toneLabels: Record<GuidedWorkflow['tone'], string> = {
  activity: '活动',
  teaching: '教务',
  attendance: '出勤',
  report: '报告',
  content: '内容',
  conversion: '转化',
}

type WorkflowGroupTone = SemanticTone

const workflowGroups: Array<{ key: string; title: string; description: string; focus: string; ids: GuidedWorkflow['id'][]; tone: WorkflowGroupTone; badge: string }> = [
  {
    key: 'publish-signup',
    title: '发布招生活动',
    description: '创建公开课、体验课、训练营等可报名入口。',
    focus: '先说清楚活动为什么发生、谁能报名、时间地点和负责人，再生成活动和报名入口。',
    ids: ['signupActivity'],
    tone: 'warning',
    badge: '招生入口',
  },
  {
    key: 'convert-signup',
    title: '处理报名转化',
    description: '处理线下报名、审核、到场和转班。',
    focus: '把报名从线索推进到体验课、长期班或待跟进池，不让操作员手动拼关系表。',
    ids: ['reviewSignup', 'convertSignupToClass'],
    tone: 'warning',
    badge: '转化跟进',
  },
  {
    key: 'create-class',
    title: '创建班级/课包',
    description: '创建一对一、多人体验、长期班或活动营。',
    focus: '一对一也是一个班；先确定班级或课包，再自然承载学员、老师和后续课堂。',
    ids: ['trialLesson', 'longTermClass'],
    tone: 'brand',
    badge: '教务主线',
  },
  {
    key: 'schedule-lesson',
    title: '安排一堂课',
    description: '给已有班级加课、补课或安排活动场次。',
    focus: '围绕时间、地点、人物和主题确认一堂真实会发生的课堂。',
    ids: ['addLesson', 'scheduleMakeupLesson'],
    tone: 'brand',
    badge: '排课动作',
  },
  {
    key: 'record-lesson',
    title: '记录上课结果',
    description: '记录出勤和课堂实际发生事实。',
    focus: '出勤是实际发生记录，不改变长期班成员关系；课后动作会回流到报告和学生档案。',
    ids: ['attendance'],
    tone: 'success',
    badge: '课堂事实',
  },
  {
    key: 'launch-report',
    title: '发起测评/报告',
    description: '发起课后、阶段和班级级反馈报告。',
    focus: '从评价目的出发，明确对象、范围、模板、评估人和最终可见结果。',
    ids: ['reportLaunch', 'closeCoursePeriod'],
    tone: 'info',
    badge: '评估反馈',
  },
  {
    key: 'content-miniapp',
    title: '内容与小程序',
    description: '发布素材，并把内容或活动配置到小程序入口。',
    focus: '这是内容运营入口，不混入教务主线；先创建内容对象，再决定展示位置。',
    ids: ['publishAudioMaterial', 'publishVideoMaterial', 'promoteContent'],
    tone: 'neutral',
    badge: '内容运营',
  },
]

export function GuidedOpsWorkspace({ resources = {}, submitting = false, onSubmitPlan, onUploadRichTextImage }: GuidedOpsWorkspaceProps) {
  const [activeWorkflow, setActiveWorkflow] = useState<GuidedWorkflow | null>(null)
  const [activeDraft, setActiveDraft] = useState<GuidedWorkflowDraft | null>(null)
  const [activeGroup, setActiveGroup] = useState(workflowGroups[0].key)
  const [drafts, setDrafts] = useState<GuidedWorkflowDraft[]>(() => loadGuidedWorkflowDrafts())
  const workflowsById = new Map(guidedWorkflows.map((workflow) => [workflow.id, workflow]))

  return (
    <div className="grid gap-4">
      <Panel>
        <PageHeader
          eyebrow="运营动作"
          title="新建事务"
          description="先选择真实工作目的，再填写少量必要信息。系统会在最后展示保存清单，方便提交前核对。"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
        />
        <Tabs value={activeGroup} onValueChange={setActiveGroup} className="p-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 bg-[var(--muted)]/42">
            {workflowGroups.map((group) => (
              <TabsTrigger key={group.key} value={group.key} className={cn('min-h-10 flex-1 basis-[180px] justify-start gap-2 border border-transparent px-3 text-[var(--muted-foreground)] data-[state=active]:border-current data-[state=active]:bg-[var(--card)]', groupColorClass(group.tone).tab)}>
                <span>{group.title}</span>
                <Badge aria-hidden="true">{new Intl.NumberFormat('zh-CN').format(group.ids.length)}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {workflowGroups.map((group) => (
            <TabsContent key={group.key} value={group.key} className="mt-4">
              <section className="grid gap-4">
                <SemanticSurface tone={group.tone}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-[var(--foreground)]">{group.title}</h3>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{group.description}</p>
                    </div>
                    <Badge tone={semanticTone(group.tone).badge}>{group.badge} · {new Intl.NumberFormat('zh-CN').format(group.ids.length)} 个模板</Badge>
                  </div>
                  <p className="mt-3 max-w-3xl text-xs leading-5 text-[var(--muted-foreground)]">{group.focus}</p>
                </SemanticSurface>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {group.ids.map((id) => {
                    const workflow = workflowsById.get(id)
                    return workflow ? (
                      <WorkflowCard
                        key={workflow.id}
                        workflow={workflow}
                        onOpen={(nextWorkflow) => {
                          setActiveDraft(null)
                          setActiveWorkflow(nextWorkflow)
                        }}
                      />
                    ) : null
                  })}
                </div>
              </section>
            </TabsContent>
          ))}
        </Tabs>
      </Panel>
      <DraftCenter
        drafts={drafts}
        onDelete={(draftId) => setDrafts(removeGuidedWorkflowDraft(draftId))}
        onResume={(draft) => {
          setActiveDraft(draft)
          setActiveWorkflow(workflowById(draft.workflowId))
        }}
      />
      <Panel>
        <SectionHeader>
          <div>
            <h3 className="font-semibold">当前数据概况</h3>
            <p className="text-sm text-[var(--muted-foreground)]">只用来判断大致体量；实际操作从上面的工作动机进入。</p>
          </div>
        </SectionHeader>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <MetricTile title="报名中心" label="报名中心" value={resources.activitySignups?.pagination.totalItems || 0} hint="报名/待分班" tone="warning" />
          <MetricTile title="班级与课包" label="班级与课包" value={resources.learningPrograms?.pagination.totalItems || 0} hint="班级/课包" tone="brand" />
          <MetricTile title="课堂中心" label="课堂中心" value={resources.learningSessions?.pagination.totalItems || 0} hint="课堂/场次" tone="info" />
        </div>
      </Panel>
      <GuidedCreateDialog
        key={activeDraft?.id || activeWorkflow?.id || 'closed'}
        open={Boolean(activeWorkflow)}
        draft={activeDraft}
        workflow={activeWorkflow}
        resources={resources}
        submitting={submitting}
        onClose={() => {
          setActiveWorkflow(null)
          setActiveDraft(null)
        }}
        onConfirm={(plan, answers) => {
          onSubmitPlan(plan, answers)
          setActiveWorkflow(null)
          setActiveDraft(null)
        }}
        onUploadRichTextImage={onUploadRichTextImage}
        onSaveDraft={(workflow, answers, stepIndex, draftId) => {
          const draft = createGuidedWorkflowDraft(workflow, answers, stepIndex, draftId)
          setDrafts(persistGuidedWorkflowDraft(draft))
          setActiveDraft(draft)
        }}
      />
    </div>
  )
}

function DraftCenter({ drafts, onDelete, onResume }: { drafts: GuidedWorkflowDraft[]; onDelete: (draftId: string) => void; onResume: (draft: GuidedWorkflowDraft) => void }) {
  return (
    <Panel>
      <SectionHeader>
        <div className="flex items-center gap-2">
          <FileClock className="h-5 w-5 text-[var(--accent-foreground)]" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">草稿中心</h3>
            <p className="text-sm text-[var(--muted-foreground)]">未完成的事务可以从这里继续填写。</p>
          </div>
        </div>
        <Badge>{drafts.length} 个草稿</Badge>
      </SectionHeader>
      <div className="grid gap-2 p-4">
        {drafts.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/25 px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">暂无流程草稿</div> : null}
        {drafts.map((draft) => (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm" key={draft.id}>
            <div>
              <div className="text-sm font-semibold">{draft.title}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{draft.workflowTitle} · 停在第 {draft.stepIndex + 1} 步 · {formatDraftTime(draft.updatedAt)}</div>
            </div>
            <div className="flex gap-2">
              <Button icon={<FileClock className="h-4 w-4" aria-hidden="true" />} onClick={() => onResume(draft)} type="button" variant="secondary">
                继续编辑
              </Button>
              <Button aria-label={`删除草稿${draft.title}`} className="h-9 w-9 px-0" icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} onClick={() => onDelete(draft.id)} type="button" variant="ghost" />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function formatDraftTime(value: string) {
  if (!value) {
    return '刚刚'
  }
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function WorkflowCard({ workflow, onOpen }: { workflow: GuidedWorkflow; onOpen: (workflow: GuidedWorkflow) => void }) {
  const [expanded, setExpanded] = useState(false)
  const tone = workflowTone(workflow.tone)
  const colors = semanticTone(tone)
  return (
    <article className={cn('group relative flex min-h-44 flex-col overflow-hidden rounded-md border p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md', colors.surface)}>
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1', colors.accent)} />
      <div className="flex items-start justify-between gap-3">
        <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current/10 bg-[var(--card)] shadow-sm', colors.emphasis)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </span>
        <Badge tone={colors.badge}>{toneLabels[workflow.tone]}</Badge>
      </div>
      <div className="mt-4 min-w-0">
        <h4 className="font-semibold leading-5 text-[var(--foreground)] [overflow-wrap:anywhere]">{workflow.title}</h4>
        <p className="mt-1 min-h-10 text-sm leading-5 text-[var(--muted-foreground)] [overflow-wrap:anywhere]">{workflow.intent}</p>
      </div>
      {expanded ? <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--card)]/70 px-3 py-2 text-xs leading-5 text-[var(--muted-foreground)] shadow-inner [overflow-wrap:anywhere]">{workflow.description}</p> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <button
          aria-label={`开始填写：${workflow.title}`}
          className={cn('inline-flex min-h-9 items-center gap-1 rounded-md bg-[var(--card)]/72 px-2.5 text-xs font-semibold shadow-sm transition hover:-translate-y-px hover:bg-[var(--card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]', colors.emphasis)}
          onClick={() => onOpen(workflow)}
          type="button"
        >
          开始填写
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          aria-expanded={expanded}
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? '收起细节' : '查看细节'}
          <ChevronDown className={expanded ? 'h-3.5 w-3.5 rotate-180 transition' : 'h-3.5 w-3.5 transition'} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

function groupColorClass(tone: WorkflowGroupTone) {
  const classes: Record<WorkflowGroupTone, { tab: string }> = {
    warning: {
      tab: 'data-[state=active]:text-[var(--warning-foreground)]',
    },
    brand: {
      tab: 'data-[state=active]:text-[var(--accent-foreground)]',
    },
    success: {
      tab: 'data-[state=active]:text-[var(--success)]',
    },
    info: {
      tab: 'data-[state=active]:text-[var(--info)]',
    },
    danger: {
      tab: 'data-[state=active]:text-[var(--destructive)]',
    },
    neutral: {
      tab: 'data-[state=active]:text-[var(--secondary-foreground)]',
    },
  }
  return classes[tone]
}

function workflowTone(tone: GuidedWorkflow['tone']): SemanticTone {
  if (tone === 'activity' || tone === 'conversion') {
    return 'warning'
  }
  if (tone === 'report' || tone === 'content') {
    return 'info'
  }
  if (tone === 'attendance') {
    return 'success'
  }
  return 'brand'
}
