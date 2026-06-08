import { CalendarCheck2, ClipboardCheck, GitCompareArrows, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  buildLessonScenes,
  buildSessionStudentPayloads,
  buildSessionTeacherPayloads,
  lessonLockedContext,
  type LessonScene,
  type RelationActionPayload,
} from '../../app/sceneWorkspaces'
import { displayResourceField } from '../../app/resourceForms'
import type { ResourceLookup } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'
import { PageHeader } from '../ui/PageHeader'
import { LockedContextCard, PeopleActionDialog, PeopleRoster, PersonRow } from './SceneComponents'
import { SceneSetupDialog } from './SceneSetupDialog'
import {
  SceneWorkspaceFocus,
  type SceneLocatorTask,
} from './SceneLocator'

interface LessonSceneWorkspaceProps {
  resources?: ResourceLookup
  loading?: boolean
  onCreateRelations: (action: RelationActionPayload) => void
}

type LessonAction = 'attendance' | 'teachers' | null
const lessonTasks: SceneLocatorTask[] = [
  { key: 'attendance', title: '记录本堂出勤', description: '确认这堂课哪些学员到课、缺席、请假或迟到。' },
  { key: 'teachers', title: '确认实际老师', description: '检查班级老师继承关系，并覆盖本堂课实际参与老师。' },
  { key: 'report', title: '准备课后反馈', description: '从课堂视角理解学员、老师和后续报告动作。' },
]

export function LessonSceneWorkspace({ resources = {}, loading = false, onCreateRelations }: LessonSceneWorkspaceProps) {
  const scenes = useMemo(() => buildLessonScenes(resources), [resources])
  const lessons = useMemo(() => scenes.map((item) => item.lesson).filter((item): item is NonNullable<typeof item> => Boolean(item)), [scenes])
  const [selectedId, setSelectedId] = useState(() => scenes[0]?.lesson?.id ? String(scenes[0].lesson.id) : '')
  const [pendingId, setPendingId] = useState(() => scenes[0]?.lesson?.id ? String(scenes[0].lesson.id) : '')
  const [selectedTask, setSelectedTask] = useState(lessonTasks[0].key)
  const [setupOpen, setSetupOpen] = useState(false)
  const [action, setAction] = useState<LessonAction>(null)
  const selectedLessonExists = lessons.some((lesson) => String(lesson.id) === selectedId)
  const selectedLessonId = selectedLessonExists ? selectedId : String(lessons[0]?.id || '')
  const pendingLessonExists = lessons.some((lesson) => String(lesson.id) === pendingId)
  const effectivePendingId = pendingLessonExists ? pendingId : selectedLessonId
  const workspaceReady = Boolean(selectedLessonId)
  const scene = scenes.find((candidate) => String(candidate.lesson?.id || '') === selectedLessonId) || scenes[0] || emptyLessonScene
  const context = lessonLockedContext(scene.lesson, scene.project)
  const selectedTaskConfig = lessonTasks.find((task) => task.key === selectedTask) || lessonTasks[0]

  function confirmSetup() {
    if (!lessons.some((lesson) => String(lesson.id) === effectivePendingId)) {
      return
    }
    setSelectedId(effectivePendingId)
    setSetupOpen(false)
  }

  function submitAttendance(selectedIds: string[], status: string) {
    if (!context) {
      return
    }
    onCreateRelations(buildSessionStudentPayloads(context.id, selectedIds, status))
    setAction(null)
  }

  function submitTeachers(selectedIds: string[], role: string) {
    if (!context) {
      return
    }
    onCreateRelations(buildSessionTeacherPayloads(context.id, selectedIds, role, 'active'))
    setAction(null)
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <PageHeader
          eyebrow="Scene workspace"
          title="课堂工作台"
          description="围绕一堂真实课程确认时间、地点、出勤、教师和课后动作；无需理解课堂关系表。"
          icon={<CalendarCheck2 className="h-5 w-5" aria-hidden="true" />}
        />
        <div className="grid gap-4 px-4 pb-4">
          {!workspaceReady ? (
            <WorkspaceSetupEntry
              objectLabel="课堂"
              title="还没有可处理的课堂"
              description="先创建或同步课堂。日常进入课堂工作台会直接展示本堂课状态、学员出勤、教师继承和课后动作。"
              onOpen={() => {
                setPendingId(selectedLessonId || String(lessons[0]?.id || ''))
                setSetupOpen(true)
              }}
            />
          ) : (
            <>
              <SceneWorkspaceFocus task={selectedTaskConfig} objectLabel="课堂" onChangeContext={() => {
                setPendingId(selectedId)
                setSetupOpen(true)
              }} />
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <LessonSummary scene={scene} />
                <div className="grid gap-3">
                  <LockedContextCard context={context} label="当前课堂" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button disabled={!context} variant={selectedTask === 'attendance' ? 'primary' : 'secondary'} onClick={() => setAction('attendance')} icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}>记录出勤</Button>
                    <Button disabled={!context} variant={selectedTask === 'teachers' ? 'primary' : 'secondary'} onClick={() => setAction('teachers')} icon={<Users className="h-4 w-4" aria-hidden="true" />}>确认课堂老师</Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Panel>

      {workspaceReady ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {selectedTask === 'teachers' ? null : <PeopleRoster title="课堂学员与出勤" people={scene.students} emptyLabel="这堂课还没有学员出勤记录，从上方记录出勤开始。" />}
          <TeacherInheritancePanel scene={scene} />
          {selectedTask === 'attendance' ? null : <PeopleRoster title="课堂实际老师" people={scene.teachers} emptyLabel="这堂课还没有单独确认老师，默认参考班级老师。" />}
          {selectedTask === 'teachers' ? <PeopleRoster title="课堂学员与出勤" people={scene.students} emptyLabel="这堂课还没有学员出勤记录，从上方记录出勤开始。" /> : null}
          {selectedTask === 'attendance' ? <PeopleRoster title="课堂实际老师" people={scene.teachers} emptyLabel="这堂课还没有单独确认老师，默认参考班级老师。" /> : null}
        </div>
      ) : null}

      <SceneSetupDialog
        open={setupOpen}
        title="配置课堂工作台"
        description="左侧确认步骤，右侧只填写当前步骤需要的信息。"
        intentTitle="你现在要处理哪类课堂任务？"
        intentDescription="先确认真实课堂动作，不提前展示出勤、继承和教师关系，避免误以为已经选中某一堂课。"
        targetTitle="搜索并确认课堂"
        targetDescription="确认要处理的课堂后，后续出勤、教师覆盖和反馈准备都会锁定在这一堂课上。"
        objectLabel="课堂"
        tasks={lessonTasks}
        selectedTask={selectedTask}
        objects={lessons}
        pendingId={effectivePendingId}
        kind="lesson"
        onTaskChange={setSelectedTask}
        onPendingChange={setPendingId}
        onConfirm={confirmSetup}
        onClose={() => setSetupOpen(false)}
      />

      <PeopleActionDialog
        open={workspaceReady && action === 'attendance'}
        title="记录课堂出勤"
        description="课堂已经锁定，只需要选择本堂课的学员和出勤结果。"
        context={context}
        contextLabel="锁定课堂"
        people={scene.students}
        optionLabel="选择学员"
        modeLabel="出勤结果"
        modeOptions={[
          { value: 'present', label: '到课' },
          { value: 'scheduled', label: '已排课' },
          { value: 'absent', label: '缺席' },
          { value: 'late', label: '迟到' },
          { value: 'leave', label: '请假' },
        ]}
        defaultMode="present"
        submitting={loading}
        onClose={() => setAction(null)}
        onSubmit={submitAttendance}
      />
      <PeopleActionDialog
        open={workspaceReady && action === 'teachers'}
        title="确认课堂老师"
        description="课堂已经锁定，只需要确认本堂课实际参与的老师和角色。"
        context={context}
        contextLabel="锁定课堂"
        people={scene.teachers}
        optionLabel="选择教师"
        modeLabel="课堂角色"
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

function LessonSummary({ scene }: { scene: LessonScene }) {
  const lesson = scene.lesson
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{String(lesson?.title || '暂无课堂')}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {scene.project ? String(scene.project.title || scene.project.id) : '未关联班级'} · {lesson?.theme ? `主题 ${String(lesson.theme)}` : '主题待定'}
          </p>
        </div>
        <Badge tone={lesson?.status === 'completed' ? 'green' : 'neutral'}>{displayResourceField('learningSessions', 'status', lesson?.status)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="出勤记录" value={scene.relationRecords.students.length} />
        <Metric label="课堂老师" value={scene.relationRecords.teachers.length} />
        <Metric label="继承教师" value={scene.inheritedTeachers.filter((person) => person.selected).length} />
      </div>
    </div>
  )
}

function TeacherInheritancePanel({ scene }: { scene: LessonScene }) {
  const inherited = scene.inheritedTeachers.filter((person) => person.selected)
  const explicit = scene.teachers.filter((person) => person.selected)
  return (
    <Panel>
      <SectionHeader>
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">教师继承与覆盖</h3>
            <p className="text-sm text-[var(--muted-foreground)]">先参考班级老师，本堂课可单独确认实际老师。</p>
          </div>
        </div>
        <Badge tone={explicit.length > 0 ? 'blue' : 'neutral'}>{explicit.length > 0 ? '已覆盖' : '继承中'}</Badge>
      </SectionHeader>
      <div className="grid gap-3 p-3">
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">班级继承</div>
          <div className="grid gap-2">
            {inherited.map((person) => <PersonRow key={person.id} person={person} selected />)}
            {inherited.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-5 text-center text-sm text-[var(--muted-foreground)]">班级还没有老师分工</div> : null}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">课堂实际</div>
          <div className="grid gap-2">
            {explicit.map((person) => <PersonRow key={person.id} person={person} selected />)}
            {explicit.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-5 text-center text-sm text-[var(--muted-foreground)]">尚未覆盖，默认参考班级老师</div> : null}
          </div>
        </div>
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

const emptyLessonScene: LessonScene = {
  lesson: null,
  project: null,
  students: [],
  teachers: [],
  inheritedTeachers: [],
  relationRecords: {
    students: [],
    teachers: [],
  },
}
