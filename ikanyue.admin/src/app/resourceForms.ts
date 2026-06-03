import type { OpsResource, ResourceRecord } from './types'

export type ResourceFieldType = 'text' | 'number' | 'datetime' | 'textarea' | 'select'

export interface ResourceFormField {
  key: string
  label: string
  type?: ResourceFieldType
  options?: Array<{ value: string; label: string }>
}

export const resourceFormFields: Partial<Record<OpsResource, ResourceFormField[]>> = {
  activities: [
    { key: 'title', label: '标题' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions(['draft', 'active', 'disabled']) },
    { key: 'type', label: '类型' },
    { key: 'location', label: '地点' },
    { key: 'startTime', label: '开始时间', type: 'datetime' },
    { key: 'endTime', label: '结束时间', type: 'datetime' },
    { key: 'price', label: '价格分', type: 'number' },
    { key: 'maxParticipants', label: '名额', type: 'number' },
    { key: 'sequence', label: '排序', type: 'number' },
    { key: 'coverImage', label: '封面 URL' },
    { key: 'images', label: '图集 URL', type: 'textarea' },
    { key: 'description', label: '详情', type: 'textarea' },
  ],
  audioMaterials: [
    { key: 'title', label: '标题' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions(['draft', 'published', 'archived']) },
    { key: 'type', label: '类型' },
    { key: 'author', label: '作者' },
    { key: 'language', label: '语言' },
    { key: 'difficulty', label: '难度' },
    { key: 'sequence', label: '排序', type: 'number' },
    { key: 'coverImage', label: '封面 URL' },
    { key: 'audioSource', label: '音频 URL' },
    { key: 'duration', label: '时长秒', type: 'number' },
    { key: 'description', label: '简介', type: 'textarea' },
  ],
  videoMaterials: [
    { key: 'title', label: '标题' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions(['draft', 'published', 'archived']) },
    { key: 'type', label: '类型' },
    { key: 'author', label: '作者' },
    { key: 'language', label: '语言' },
    { key: 'difficulty', label: '难度' },
    { key: 'resolution', label: '清晰度' },
    { key: 'sequence', label: '排序', type: 'number' },
    { key: 'coverImage', label: '封面 URL' },
    { key: 'videoSource', label: '视频 URL' },
    { key: 'duration', label: '时长秒', type: 'number' },
    { key: 'description', label: '简介', type: 'textarea' },
  ],
  operationSlots: [
    { key: 'channel', label: '端', type: 'select', options: statusOptions(['wechat-mini', 'alipay-mini', 'app', 'web']) },
    { key: 'placement', label: '位置' },
    { key: 'title', label: '标题' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions(['draft', 'active', 'disabled']) },
    { key: 'sortOrder', label: '排序', type: 'number' },
    { key: 'visibleFrom', label: '开始展示', type: 'datetime' },
    { key: 'visibleTo', label: '结束展示', type: 'datetime' },
    { key: 'imageUrl', label: '图片 URL' },
    { key: 'targetType', label: '目标类型', type: 'select', options: statusOptions(['activity', 'audio', 'video', 'assessment_report', 'webview', 'none']) },
    { key: 'targetId', label: '目标 ID' },
    { key: 'targetUrl', label: '目标 URL' },
  ],
  activitySignups: [
    { key: 'realName', label: '姓名' },
    { key: 'age', label: '年龄', type: 'number' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions(['registered', 'cancelled', 'attended', 'no_show']) },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
}

export function canEditResource(resource: OpsResource): boolean {
  return Boolean(resourceFormFields[resource])
}

export function buildResourceFormState(resource: OpsResource, record: ResourceRecord = { id: '' }): Record<string, string> {
  return (resourceFormFields[resource] || []).reduce<Record<string, string>>((state, field) => {
    const value = record[field.key]
    state[field.key] = value === undefined || value === null ? '' : String(value)
    return state
  }, {})
}

export function buildResourcePayload(resource: OpsResource, form: Record<string, string>): Record<string, unknown> {
  return (resourceFormFields[resource] || []).reduce<Record<string, unknown>>((payload, field) => {
    const raw = form[field.key]
    if (raw === undefined || raw === '') {
      return payload
    }
    payload[field.key] = field.type === 'number' ? Number(raw) : raw
    return payload
  }, {})
}

export function nextPublishStatus(resource: OpsResource, current: unknown): string | null {
  if (resource === 'activities' || resource === 'operationSlots') {
    return current === 'active' ? 'draft' : 'active'
  }
  if (resource === 'audioMaterials' || resource === 'videoMaterials') {
    return current === 'published' ? 'draft' : 'published'
  }
  return null
}

function statusOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }))
}
