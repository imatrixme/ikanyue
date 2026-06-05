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
import { Select } from '../ui/Select'
import { LockedContextCard, PeopleActionDialog, PeopleRoster, PersonRow } from './SceneComponents'

interface LessonSceneWorkspaceProps {
  resources?: ResourceLookup
  loading?: boolean
  onCreateRelations: (action: RelationActionPayload) => void
}

type LessonAction = 'attendance' | 'teachers' | null

export function LessonSceneWorkspace({ resources = {}, loading = false, onCreateRelations }: LessonSceneWorkspaceProps) {
  const scenes = useMemo(() => buildLessonScenes(resources), [resources])
  const [selectedId, setSelectedId] = useState(() => scenes[0]?.lesson?.id ? String(scenes[0].lesson.id) : '')
  const [action, setAction] = useState<LessonAction>(null)
  const scene = scenes.find((candidate) => String(candidate.lesson?.id || '') === selectedId) || scenes[0] || emptyLessonScene
  const context = lessonLockedContext(scene.lesson, scene.project)

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
          title="课次工作台"
          description="围绕一堂真实课程确认时间、地点、出勤、教师和课后动作；无需理解课次关系表。"
          icon={<CalendarCheck2 className="h-5 w-5" aria-hidden="true" />}
          actions={(
            <Select
              aria-label="选择课次"
              className="min-w-[240px]"
              value={String(scene.lesson?.id || '')}
              options={scenes.map((item) => ({ value: String(item.lesson?.id || ''), label: String(item.lesson?.title || item.lesson?.id || '未命名课次') }))}
              onChange={(event) => setSelectedId(event.target.value)}
            />
          )}
        />
        <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr]">
          <LessonSummary scene={scene} />
          <div className="grid gap-3">
            <LockedContextCard context={context} label="当前课次" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={!context} onClick={() => setAction('attendance')} icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}>记录出勤</Button>
              <Button disabled={!context} onClick={() => setAction('teachers')} icon={<Users className="h-4 w-4" aria-hidden="true" />}>确认课次教师</Button>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <PeopleRoster title="课次学员与出勤" people={scene.students} emptyLabel="这堂课还没有学员出勤记录，从上方记录出勤开始。" />
        <TeacherInheritancePanel scene={scene} />
        <PeopleRoster title="课次实际教师" people={scene.teachers} emptyLabel="这堂课还没有单独确认教师，默认参考项目教师。" />
      </div>

      <PeopleActionDialog
        open={action === 'attendance'}
        title="记录课次出勤"
        description="课次已经锁定，只需要选择本堂课的学员和出勤结果。"
        context={context}
        contextLabel="锁定课次"
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
        open={action === 'teachers'}
        title="确认课次教师"
        description="课次已经锁定，只需要确认本堂课实际参与的教师和角色。"
        context={context}
        contextLabel="锁定课次"
        people={scene.teachers}
        optionLabel="选择教师"
        modeLabel="课次角色"
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
          <h2 className="text-lg font-semibold">{String(lesson?.title || '暂无课次')}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {scene.project ? String(scene.project.title || scene.project.id) : '未关联项目'} · {lesson?.theme ? `主题 ${String(lesson.theme)}` : '主题待定'}
          </p>
        </div>
        <Badge tone={lesson?.status === 'completed' ? 'green' : 'neutral'}>{displayResourceField('learningSessions', 'status', lesson?.status)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="出勤记录" value={scene.relationRecords.students.length} />
        <Metric label="课次教师" value={scene.relationRecords.teachers.length} />
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
            <p className="text-sm text-[var(--muted-foreground)]">先参考项目教师，本堂课可单独确认实际教师。</p>
          </div>
        </div>
        <Badge tone={explicit.length > 0 ? 'blue' : 'neutral'}>{explicit.length > 0 ? '已覆盖' : '继承中'}</Badge>
      </SectionHeader>
      <div className="grid gap-3 p-3">
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">项目继承</div>
          <div className="grid gap-2">
            {inherited.map((person) => <PersonRow key={person.id} person={person} selected />)}
            {inherited.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-5 text-center text-sm text-[var(--muted-foreground)]">项目还没有教师分工</div> : null}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">课次实际</div>
          <div className="grid gap-2">
            {explicit.map((person) => <PersonRow key={person.id} person={person} selected />)}
            {explicit.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-5 text-center text-sm text-[var(--muted-foreground)]">尚未覆盖，默认参考项目教师</div> : null}
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
