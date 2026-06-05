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
import { LockedContextCard, PeopleActionDialog, PeopleRoster } from './SceneComponents'
import { SceneSetupDialog } from './SceneSetupDialog'
import {
  SceneWorkspaceFocus,
  type SceneLocatorTask,
} from './SceneLocator'

interface ProjectSceneWorkspaceProps {
  resources?: ResourceLookup
  loading?: boolean
  onCreateRelations: (action: RelationActionPayload) => void
}

type ProjectAction = 'students' | 'teachers' | null
const projectTasks: SceneLocatorTask[] = [
  { key: 'students', title: '管理项目学员', description: '把报名、体验或长期学习的学员加入这个项目。' },
  { key: 'teachers', title: '安排项目老师', description: '为项目确定主讲、助教、评估人或观察员。' },
  { key: 'timeline', title: '查看课次推进', description: '从项目视角理解已经计划或发生的课次。' },
]

export function ProjectSceneWorkspace({ resources = {}, loading = false, onCreateRelations }: ProjectSceneWorkspaceProps) {
  const scenes = useMemo(() => buildProjectScenes(resources), [resources])
  const projects = useMemo(() => scenes.map((item) => item.project).filter((item): item is NonNullable<typeof item> => Boolean(item)), [scenes])
  const [selectedId, setSelectedId] = useState(() => scenes[0]?.project?.id ? String(scenes[0].project.id) : '')
  const [pendingId, setPendingId] = useState(() => scenes[0]?.project?.id ? String(scenes[0].project.id) : '')
  const [selectedTask, setSelectedTask] = useState(projectTasks[0].key)
  const [setupOpen, setSetupOpen] = useState(false)
  const [action, setAction] = useState<ProjectAction>(null)
  const selectedProjectExists = projects.some((project) => String(project.id) === selectedId)
  const selectedSceneId = selectedProjectExists ? selectedId : String(projects[0]?.id || '')
  const pendingProjectExists = projects.some((project) => String(project.id) === pendingId)
  const effectivePendingId = pendingProjectExists ? pendingId : selectedSceneId
  const workspaceReady = Boolean(selectedSceneId)
  const scene = scenes.find((candidate) => String(candidate.project?.id || '') === selectedSceneId) || scenes[0] || emptyProjectScene
  const context = projectLockedContext(scene.project)
  const selectedTaskConfig = projectTasks.find((task) => task.key === selectedTask) || projectTasks[0]

  function confirmSetup() {
    if (!projects.some((project) => String(project.id) === effectivePendingId)) {
      return
    }
    setSelectedId(effectivePendingId)
    setSetupOpen(false)
  }

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
        />
        <div className="grid gap-4 px-4 pb-4">
          {!workspaceReady ? (
            <WorkspaceSetupEntry
              objectLabel="项目"
              title="还没有可管理的教学项目"
              description="先创建教学项目，或在数据同步后从这里确认已有项目。日常进入项目工作台会直接展示项目状态、学员、老师和课次。"
              onOpen={() => {
                setPendingId(selectedSceneId || String(projects[0]?.id || ''))
                setSetupOpen(true)
              }}
            />
          ) : (
            <>
              <SceneWorkspaceFocus task={selectedTaskConfig} objectLabel="项目" onChangeContext={() => {
                setPendingId(selectedId)
                setSetupOpen(true)
              }} />
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <ProjectSummary scene={scene} />
                <div className="grid gap-3">
                  <LockedContextCard context={context} label="当前项目" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button disabled={!context} variant={selectedTask === 'students' ? 'primary' : 'secondary'} onClick={() => setAction('students')} icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}>添加项目学员</Button>
                    <Button disabled={!context} variant={selectedTask === 'teachers' ? 'primary' : 'secondary'} onClick={() => setAction('teachers')} icon={<Users className="h-4 w-4" aria-hidden="true" />}>分配项目教师</Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Panel>

      {workspaceReady ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {selectedTask === 'teachers' ? null : <PeopleRoster title="项目学员" people={scene.students} emptyLabel="这个项目还没有关联学员，从上方添加项目学员开始。" />}
          {selectedTask === 'students' ? null : <PeopleRoster title="项目教师" people={scene.teachers} emptyLabel="这个项目还没有教师分工，从上方分配项目教师开始。" />}
          <LessonTimeline scene={scene} />
          {selectedTask === 'teachers' ? <PeopleRoster title="项目学员" people={scene.students} emptyLabel="这个项目还没有关联学员，从上方添加项目学员开始。" /> : null}
          {selectedTask === 'students' ? <PeopleRoster title="项目教师" people={scene.teachers} emptyLabel="这个项目还没有教师分工，从上方分配项目教师开始。" /> : null}
        </div>
      ) : null}

      <SceneSetupDialog
        open={setupOpen}
        title="配置项目工作台"
        description="左侧确认步骤，右侧只填写当前步骤需要的信息。"
        intentTitle="你现在要处理哪类项目任务？"
        intentDescription="先确认工作动机，不展示项目列表和关系数据，避免一进来就被信息淹没。"
        targetTitle="搜索并确认项目"
        targetDescription="确认要处理的项目后，后续添加学员、安排老师和查看课次都会锁定在这个项目上。"
        objectLabel="项目"
        tasks={projectTasks}
        selectedTask={selectedTask}
        objects={projects}
        pendingId={effectivePendingId}
        kind="project"
        onTaskChange={setSelectedTask}
        onPendingChange={setPendingId}
        onConfirm={confirmSetup}
        onClose={() => setSetupOpen(false)}
      />

      <PeopleActionDialog
        open={workspaceReady && action === 'students'}
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
        open={workspaceReady && action === 'teachers'}
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

function WorkspaceSetupEntry({ objectLabel, title, description, onOpen }: { objectLabel: string; title: string; description: string; onOpen: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge tone="amber">待确认{objectLabel}</Badge>
          <h3 className="mt-3 text-lg font-semibold">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
        </div>
        <Button type="button" onClick={onOpen}>打开配置弹窗</Button>
      </div>
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
