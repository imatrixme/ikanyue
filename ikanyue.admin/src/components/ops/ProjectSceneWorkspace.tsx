import { CalendarRange, GraduationCap, SquareStack, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  buildProgramStudentPayloads,
  buildProgramTeacherPayloads,
  buildProjectScenes,
  projectLockedContext,
  type ProjectScene,
  type RelationActionPayload,
} from '../../app/sceneWorkspaces'
import type { ResourceLookup } from '../../app/types'
import { displayResourceField } from '../../app/resourceForms'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'
import { PageHeader } from '../ui/PageHeader'
import { Select } from '../ui/Select'
import { LockedContextCard, PeopleActionDialog, PeopleRoster } from './SceneComponents'

interface ProjectSceneWorkspaceProps {
  resources?: ResourceLookup
  loading?: boolean
  onCreateRelations: (action: RelationActionPayload) => void
}

type ProjectAction = 'students' | 'teachers' | null

export function ProjectSceneWorkspace({ resources = {}, loading = false, onCreateRelations }: ProjectSceneWorkspaceProps) {
  const scenes = useMemo(() => buildProjectScenes(resources), [resources])
  const [selectedId, setSelectedId] = useState(() => scenes[0]?.project?.id ? String(scenes[0].project.id) : '')
  const [action, setAction] = useState<ProjectAction>(null)
  const scene = scenes.find((candidate) => String(candidate.project?.id || '') === selectedId) || scenes[0] || emptyProjectScene
  const context = projectLockedContext(scene.project)

  function submitStudents(selectedIds: string[], status: string) {
    if (!context) {
      return
    }
    onCreateRelations(buildProgramStudentPayloads(context.id, selectedIds, status))
    setAction(null)
  }

  function submitTeachers(selectedIds: string[], role: string) {
    if (!context) {
      return
    }
    onCreateRelations(buildProgramTeacherPayloads(context.id, selectedIds, role, 'active'))
    setAction(null)
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <PageHeader
          eyebrow="Scene workspace"
          title="项目工作台"
          description="围绕一个教学项目管理学员、教师、课次和下一步动作；关系表只作为结果和维护视图。"
          icon={<SquareStack className="h-5 w-5" aria-hidden="true" />}
          actions={(
            <Select
              aria-label="选择项目"
              className="min-w-[240px]"
              value={String(scene.project?.id || '')}
              options={scenes.map((item) => ({ value: String(item.project?.id || ''), label: String(item.project?.title || item.project?.id || '未命名项目') }))}
              onChange={(event) => setSelectedId(event.target.value)}
            />
          )}
        />
        <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr]">
          <ProjectSummary scene={scene} />
          <div className="grid gap-3">
            <LockedContextCard context={context} label="当前项目" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={!context} onClick={() => setAction('students')} icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}>添加项目学员</Button>
              <Button disabled={!context} onClick={() => setAction('teachers')} icon={<Users className="h-4 w-4" aria-hidden="true" />}>分配项目教师</Button>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <PeopleRoster title="项目学员" people={scene.students} emptyLabel="这个项目还没有关联学员，从上方添加项目学员开始。" />
        <PeopleRoster title="项目教师" people={scene.teachers} emptyLabel="这个项目还没有教师分工，从上方分配项目教师开始。" />
        <LessonTimeline scene={scene} />
      </div>

      <PeopleActionDialog
        open={action === 'students'}
        title="添加项目学员"
        description="项目已经锁定，只需要选择哪些学员加入这个项目。"
        context={context}
        contextLabel="锁定项目"
        people={scene.students}
        optionLabel="选择学员"
        modeLabel="项目关系状态"
        modeOptions={[
          { value: 'active', label: '学习中' },
          { value: 'registered', label: '已报名' },
          { value: 'invited', label: '已邀请' },
          { value: 'paused', label: '暂停' },
        ]}
        defaultMode="active"
        submitting={loading}
        onClose={() => setAction(null)}
        onSubmit={submitStudents}
      />
      <PeopleActionDialog
        open={action === 'teachers'}
        title="分配项目教师"
        description="项目已经锁定，只需要选择教师并定义项目级分工。"
        context={context}
        contextLabel="锁定项目"
        people={scene.teachers}
        optionLabel="选择教师"
        modeLabel="项目角色"
        modeOptions={[
          { value: 'lead', label: '主讲' },
          { value: 'assistant', label: '助教' },
          { value: 'evaluator', label: '评估人' },
          { value: 'observer', label: '观察员' },
        ]}
        defaultMode="lead"
        submitting={loading}
        onClose={() => setAction(null)}
        onSubmit={submitTeachers}
      />
    </div>
  )
}

function ProjectSummary({ scene }: { scene: ProjectScene }) {
  const project = scene.project
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{String(project?.title || '暂无项目')}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{summaryText(scene)}</p>
        </div>
        <Badge tone={project?.status === 'active' ? 'green' : 'neutral'}>{displayResourceField('learningPrograms', 'status', project?.status)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="项目学员" value={scene.relationRecords.students.length} />
        <Metric label="项目教师" value={scene.relationRecords.teachers.length} />
        <Metric label="实际课次" value={scene.sessions.length} />
      </div>
    </div>
  )
}

function LessonTimeline({ scene }: { scene: ProjectScene }) {
  return (
    <Panel>
      <SectionHeader>
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">课次时间线</h3>
            <p className="text-sm text-[var(--muted-foreground)]">从项目自然查看已经发生或计划中的课次。</p>
          </div>
        </div>
        <Badge>{scene.sessions.length} 节</Badge>
      </SectionHeader>
      <div className="grid gap-2 p-3">
        {scene.sessions.map((session) => (
          <div key={session.id} className="rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">{String(session.title || session.id)}</div>
              <Badge>{displayResourceField('learningSessions', 'status', session.status)}</Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{session.theme ? `主题 ${String(session.theme)}` : '主题待定'}</p>
          </div>
        ))}
        {scene.sessions.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">这个项目还没有课次</div> : null}
      </div>
    </Panel>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function summaryText(scene: ProjectScene) {
  const project = scene.project
  const type = displayResourceField('learningPrograms', 'type', project?.type)
  const count = project?.plannedSessionCount === undefined ? '课次数待定' : `计划 ${Number(project.plannedSessionCount)} 节`
  return `${type} · ${count}`
}

const emptyProjectScene: ProjectScene = {
  project: null,
  students: [],
  teachers: [],
  sessions: [],
  relationRecords: {
    students: [],
    teachers: [],
  },
}
