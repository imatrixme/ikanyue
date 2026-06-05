import { displayResourceField, recordLabel } from '../../app/resourceForms'
import type { ResourceRecord } from '../../app/types'

export type SceneObjectKind = 'project' | 'lesson'

export function objectTitle(object: ResourceRecord) {
  return String(object.title || recordLabel(object))
}

export function objectSubtitle(object: ResourceRecord, kind: SceneObjectKind) {
  if (kind === 'project') {
    return [
      displayResourceField('learningPrograms', 'type', object.type),
      object.plannedSessionCount === undefined ? '课次数待定' : `计划 ${Number(object.plannedSessionCount)} 节`,
    ].filter(Boolean).join(' · ')
  }
  return [
    object.theme ? `主题 ${String(object.theme)}` : '主题待定',
    object.location ? String(object.location) : '',
  ].filter(Boolean).join(' · ')
}

export function objectStatus(object: ResourceRecord, kind: SceneObjectKind) {
  return displayResourceField(kind === 'project' ? 'learningPrograms' : 'learningSessions', 'status', object.status)
}

export function objectContext(object: ResourceRecord, kind: SceneObjectKind) {
  if (kind === 'project') {
    return object.plannedStartAt ? String(object.plannedStartAt) : '时间待定'
  }
  return [object.startTime ? String(object.startTime) : '', object.endTime ? String(object.endTime) : ''].filter(Boolean).join(' - ') || '时间待定'
}

export function objectSearchText(object: ResourceRecord) {
  return Object.values(object).join(' ').toLowerCase()
}
