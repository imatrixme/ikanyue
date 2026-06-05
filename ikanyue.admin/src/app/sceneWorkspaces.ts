import { displayResourceField, recordLabel } from './resourceForms'
import type { ResourceLookup, ResourceRecord } from './types'

export type PersonKind = 'student' | 'teacher'
export type ParentKind = 'project' | 'lesson'

export interface PersonOption {
  id: string
  kind: PersonKind
  name: string
  secondary: string
  avatar?: string
  status?: string
  relationStatus?: string
  role?: string
  selected: boolean
  sourceRecord: ResourceRecord
}

export interface ProjectScene {
  project: ResourceRecord | null
  students: PersonOption[]
  teachers: PersonOption[]
  sessions: ResourceRecord[]
  relationRecords: {
    students: ResourceRecord[]
    teachers: ResourceRecord[]
  }
}

export interface LessonScene {
  lesson: ResourceRecord | null
  project: ResourceRecord | null
  students: PersonOption[]
  teachers: PersonOption[]
  inheritedTeachers: PersonOption[]
  relationRecords: {
    students: ResourceRecord[]
    teachers: ResourceRecord[]
  }
}

export interface LockedContext {
  kind: ParentKind
  id: string
  title: string
  subtitle: string
}

export interface RelationActionPayload {
  resource: 'programStudents' | 'programTeachers' | 'sessionStudents' | 'sessionTeachers'
  payloads: Array<Record<string, unknown>>
}

export function buildProjectScenes(resources: ResourceLookup = {}): ProjectScene[] {
  return (resources.learningPrograms?.items || []).map((project) => buildProjectScene(resources, String(project.id)))
}

export function buildLessonScenes(resources: ResourceLookup = {}): LessonScene[] {
  return (resources.learningSessions?.items || []).map((lesson) => buildLessonScene(resources, String(lesson.id)))
}

export function buildProjectScene(resources: ResourceLookup = {}, projectId: string): ProjectScene {
  const project = findRecord(resources.learningPrograms?.items, projectId)
  const programStudents = (resources.programStudents?.items || []).filter((record) => String(record.programId || '') === projectId)
  const programTeachers = (resources.programTeachers?.items || []).filter((record) => String(record.programId || '') === projectId)
  const sessions = (resources.learningSessions?.items || []).filter((record) => String(record.programId || '') === projectId)

  return {
    project,
    students: buildPeopleOptions(resources.students?.items || [], programStudents, 'student', 'studentId', 'programStudents'),
    teachers: buildPeopleOptions(resources.teachers?.items || [], programTeachers, 'teacher', 'teacherId', 'programTeachers'),
    sessions,
    relationRecords: {
      students: programStudents,
      teachers: programTeachers,
    },
  }
}

export function buildLessonScene(resources: ResourceLookup = {}, lessonId: string): LessonScene {
  const lesson = findRecord(resources.learningSessions?.items, lessonId)
  const projectId = String(lesson?.programId || '')
  const project = findRecord(resources.learningPrograms?.items, projectId)
  const sessionStudents = (resources.sessionStudents?.items || []).filter((record) => String(record.sessionId || '') === lessonId)
  const sessionTeachers = (resources.sessionTeachers?.items || []).filter((record) => String(record.sessionId || '') === lessonId)
  const inheritedTeacherRelations = (resources.programTeachers?.items || []).filter((record) => String(record.programId || '') === projectId)

  return {
    lesson,
    project,
    students: buildPeopleOptions(resources.students?.items || [], sessionStudents, 'student', 'studentId', 'sessionStudents'),
    teachers: buildPeopleOptions(resources.teachers?.items || [], sessionTeachers, 'teacher', 'teacherId', 'sessionTeachers'),
    inheritedTeachers: buildPeopleOptions(resources.teachers?.items || [], inheritedTeacherRelations, 'teacher', 'teacherId', 'programTeachers'),
    relationRecords: {
      students: sessionStudents,
      teachers: sessionTeachers,
    },
  }
}

export function projectLockedContext(project: ResourceRecord | null): LockedContext | null {
  if (!project?.id) {
    return null
  }
  return {
    kind: 'project',
    id: String(project.id),
    title: String(project.title || recordLabel(project)),
    subtitle: [
      displayResourceField('learningPrograms', 'type', project.type),
      displayResourceField('learningPrograms', 'status', project.status),
      formatCount(project.plannedSessionCount, '计划课次'),
    ].filter(Boolean).join(' · '),
  }
}

export function lessonLockedContext(lesson: ResourceRecord | null, project: ResourceRecord | null): LockedContext | null {
  if (!lesson?.id) {
    return null
  }
  return {
    kind: 'lesson',
    id: String(lesson.id),
    title: String(lesson.title || recordLabel(lesson)),
    subtitle: [
      project ? String(project.title || recordLabel(project)) : '',
      lesson.theme ? `主题 ${String(lesson.theme)}` : '',
      displayResourceField('learningSessions', 'status', lesson.status),
    ].filter(Boolean).join(' · '),
  }
}

export function buildProgramStudentPayloads(programId: string, studentIds: string[], status = 'active'): RelationActionPayload {
  return {
    resource: 'programStudents',
    payloads: uniqueIds(studentIds).map((studentId) => ({ programId, studentId, status })),
  }
}

export function buildProgramTeacherPayloads(programId: string, teacherIds: string[], role = 'lead', status = 'active'): RelationActionPayload {
  return {
    resource: 'programTeachers',
    payloads: uniqueIds(teacherIds).map((teacherId) => ({ programId, teacherId, role, status })),
  }
}

export function buildSessionStudentPayloads(sessionId: string, studentIds: string[], status = 'present'): RelationActionPayload {
  return {
    resource: 'sessionStudents',
    payloads: uniqueIds(studentIds).map((studentId) => ({ sessionId, studentId, status })),
  }
}

export function buildSessionTeacherPayloads(sessionId: string, teacherIds: string[], role = 'lead', status = 'active'): RelationActionPayload {
  return {
    resource: 'sessionTeachers',
    payloads: uniqueIds(teacherIds).map((teacherId) => ({ sessionId, teacherId, role, status })),
  }
}

export function selectedPeopleFirst(options: PersonOption[], selectedIds: string[]) {
  const selectedSet = new Set(selectedIds)
  return [...options].sort((a, b) => {
    const aSelected = selectedSet.has(a.id) || a.selected
    const bSelected = selectedSet.has(b.id) || b.selected
    if (aSelected !== bSelected) {
      return aSelected ? -1 : 1
    }
    if (a.selected !== b.selected) {
      return a.selected ? -1 : 1
    }
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

export function filterPeople(options: PersonOption[], query: string) {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return options
  }
  return options.filter((option) => [
    option.name,
    option.secondary,
    option.relationStatus,
    option.role,
    option.sourceRecord.realName,
    option.sourceRecord.nickName,
    option.sourceRecord.cellphone,
    option.sourceRecord.id,
  ].filter(Boolean).join(' ').toLowerCase().includes(keyword))
}

function buildPeopleOptions(records: ResourceRecord[], relations: ResourceRecord[], kind: PersonKind, relationKey: 'studentId' | 'teacherId', relationResource: 'programStudents' | 'programTeachers' | 'sessionStudents' | 'sessionTeachers'): PersonOption[] {
  const relationByPerson = new Map(relations.map((relation) => [String(relation[relationKey] || ''), relation]))
  return records.map((record) => {
    const relation = relationByPerson.get(String(record.id))
    return {
      id: String(record.id),
      kind,
      name: String(record.realName || record.nickName || record.cellphone || record.id),
      secondary: String(record.cellphone || record.nickName || record.id),
      avatar: typeof record.avatar === 'string' ? record.avatar : undefined,
      status: statusText(record),
      relationStatus: relation?.status ? displayResourceField(relationResource, 'status', relation.status) : undefined,
      role: relation?.role ? displayResourceField(relationResource, 'role', relation.role) : undefined,
      selected: Boolean(relation),
      sourceRecord: record,
    }
  })
}

function statusText(record: ResourceRecord) {
  if (record.blocked === true) {
    return '已禁用'
  }
  if (record.verified === false) {
    return '待审核'
  }
  return '可用'
}

function findRecord(records: ResourceRecord[] | undefined, id: string) {
  return (records || []).find((record) => String(record.id) === id) || null
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function formatCount(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') {
    return ''
  }
  return `${Number(value)} ${label}`
}
