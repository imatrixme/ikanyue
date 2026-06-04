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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'
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

const workflowGroups: Array<{ key: string; title: string; description: string; focus: string; ids: GuidedWorkflow['id'][] }> = [
  {
    key: 'conversion',
    title: '报名与转化',
    description: '面向公开报名、人工补录、审核和转班。',
    focus: '先处理招生动机，再把报名自然沉淀到学生、班级和课次。',
    ids: ['signupActivity', 'reviewSignup', 'convertSignupToClass'],
  },
  {
    key: 'teaching',
    title: '教务排课',
    description: '围绕班级、课次、补课和出勤形成真实教学记录。',
    focus: '把时间、地点、人物一次说清楚，系统同步生成项目、课次和参与关系。',
    ids: ['trialLesson', 'longTermClass', 'addLesson', 'scheduleMakeupLesson', 'attendance'],
  },
  {
    key: 'content',
    title: '内容与投放',
    description: '发布素材，并把内容或活动配置到小程序入口。',
    focus: '先创建内容对象，再决定出现在哪个运营位和入口。',
    ids: ['publishAudioMaterial', 'publishVideoMaterial', 'promoteContent'],
  },
  {
    key: 'reports',
    title: '测评与报告',
    description: '发起课后、阶段和项目级反馈报告。',
    focus: '从评价目的出发，明确对象、范围、模板和可见结果。',
    ids: ['reportLaunch', 'closeCoursePeriod'],
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
          eyebrow="Guided operations"
          title="运营流程工作台"
          description="从人的动机开始创建活动、体验课、班级、课次、出勤和报告；数据关系由流程自动生成。"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
        />
        <Tabs value={activeGroup} onValueChange={setActiveGroup} className="p-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-[var(--muted)]/60">
            {workflowGroups.map((group) => (
              <TabsTrigger key={group.key} value={group.key} className="min-h-10 flex-1 basis-[180px] justify-start gap-2 px-3">
                <span>{group.title}</span>
                <Badge aria-hidden="true">{group.ids.length}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {workflowGroups.map((group) => (
            <TabsContent key={group.key} value={group.key} className="mt-4">
              <section className="grid gap-4">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[var(--foreground)]">{group.title}</h3>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{group.description}</p>
                    </div>
                    <Badge tone="blue">{group.ids.length} 个流程</Badge>
                  </div>
                  <p className="mt-3 max-w-3xl text-xs leading-5 text-[var(--muted-foreground)]">{group.focus}</p>
                </div>
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
            <h3 className="font-semibold">场景化冗余展示</h3>
            <p className="text-sm text-[var(--muted-foreground)]">同一份数据会自然出现在多个场景视角，原始数据表只作为高级维护。</p>
          </div>
        </SectionHeader>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <SceneStat title="报名中心" value={resources.activitySignups?.pagination.totalItems || 0} label="报名/待分班" />
          <SceneStat title="班级与项目" value={resources.learningPrograms?.pagination.totalItems || 0} label="项目/班级单元" />
          <SceneStat title="课次中心" value={resources.learningSessions?.pagination.totalItems || 0} label="实际课次" />
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
          <FileClock className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">草稿中心</h3>
            <p className="text-sm text-[var(--muted-foreground)]">未完成的流程可以从这里捡起继续编辑。</p>
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
              <div className="text-xs text-[var(--muted-foreground)]">{draft.workflowTitle} · 第 {draft.stepIndex + 1} 步 · {formatDraftTime(draft.updatedAt)}</div>
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
  return (
    <article className="group rounded-md border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition hover:border-cyan-200 hover:shadow-md">
      <button
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => onOpen(workflow)}
        type="button"
      >
        <div className="min-w-0">
          <Badge tone={workflow.tone === 'report' || workflow.tone === 'content' ? 'blue' : workflow.tone === 'attendance' || workflow.tone === 'conversion' ? 'amber' : 'green'}>{toneLabels[workflow.tone]}</Badge>
          <h4 className="mt-2 text-[13px] font-semibold">{workflow.title}</h4>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{workflow.intent}</p>
        </div>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition group-hover:bg-slate-800">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
      {expanded ? <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">{workflow.description}</p> : null}
      <button
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {expanded ? '收起细节' : '查看细节'}
        <ChevronDown className={expanded ? 'h-3.5 w-3.5 rotate-180 transition' : 'h-3.5 w-3.5 transition'} aria-hidden="true" />
      </button>
    </article>
  )
}

function SceneStat({ title, value, label }: { title: string; value: number; label: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <div className="text-sm text-[var(--muted-foreground)]">{title}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-[var(--muted-foreground)]">{label}</div>
    </div>
  )
}
