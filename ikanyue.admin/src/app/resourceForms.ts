import type { OpsResource, ResourceLookup, ResourceRecord } from './types'

export type ResourceFieldType = 'text' | 'number' | 'datetime' | 'textarea' | 'select' | 'boolean' | 'relation' | 'file'
export type ResourceFormValue = string | File

export interface ResourceFormField {
  key: string
  label: string
  type?: ResourceFieldType
  options?: Array<{ value: string; label: string }>
  accept?: string
  relation?: OpsResource
  relations?: OpsResource[]
  allowEmpty?: boolean
}

function labeledOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

export function recordLabel(record: ResourceRecord) {
  const title = record.title || record.name || record.realName || record.nickName || record.cellphone || record.action || record.id
  const secondary = record.realName && record.nickName && record.realName !== record.nickName ? record.nickName : record.cellphone
  return secondary && title !== secondary ? `${String(title)} · ${String(secondary)}` : `${String(title)}`
}

export function resourceOptions(resource: OpsResource, resources: ResourceLookup = {}) {
  return (resources[resource]?.items || []).map((record) => ({
    value: String(record.id),
    label: recordLabel(record),
  }))
}

export function fieldRelationOptions(field: ResourceFormField, resources: ResourceLookup = {}) {
  const relations = field.relations || (field.relation ? [field.relation] : [])
  return relations.flatMap((resource) => resourceOptions(resource, resources))
}

export const booleanOptions = [
  { value: 'true', label: '是' },
  { value: 'false', label: '否' },
]

const publishOptions = labeledOptions({ draft: '草稿', published: '已发布', archived: '已归档' })
const lifecycleOptions = labeledOptions({ draft: '草稿', active: '进行中', completed: '已完成', cancelled: '已取消' })
const activeOptions = labeledOptions({ active: '启用', inactive: '停用' })
const teacherRoleOptions = labeledOptions({ lead: '主讲', assistant: '助教', evaluator: '评估人', observer: '观察员' })
const genderOptions = labeledOptions({ '0': '未知', '1': '男', '2': '女' })
const languageOptions = labeledOptions({ zh: '中文', en: '英文', mixed: '中英混合' })
const difficultyOptions = labeledOptions({ L1: 'L1 入门', L2: 'L2 基础', L3: 'L3 进阶', L4: 'L4 高阶' })
const reportTypeOptions = labeledOptions({
  student_assessment: '学生测评',
  midterm_student: '期中学生反馈',
  final_student: '期末学生反馈',
  teacher_feedback: '教师反馈',
  session_summary: '课堂总结',
  program_summary: '班级总评',
})
const commonFieldLabels: Record<string, Record<string, string>> = {
  action: {
    'ops.assessment_record.submit': '提交评估',
    'ops.student.detail': '查看学员详情',
  },
  outcome: { success: '成功', denied: '拒绝', failed: '失败' },
  recipientType: { student: '学员', teacher: '教师', admin: '管理员' },
  reportType: Object.fromEntries(reportTypeOptions.map((option) => [option.value, option.label])),
  resourceType: {
    activity: '活动',
    assessment_record: '评估记录',
    report: '报告',
    student: '学员',
    teacher: '教师',
  },
  status: {
    active: '启用',
    archived: '已归档',
    cancelled: '已取消',
    closed: '已关闭',
    completed: '已完成',
    draft: '草稿',
    inactive: '停用',
    open: '进行中',
    planned: '计划中',
    published: '已发布',
  },
}
const implicitRelationsByKey: Record<string, OpsResource[]> = {
  activityId: ['activities'],
  actorId: ['teachers', 'students'],
  programId: ['learningPrograms'],
  recipientId: ['students', 'teachers'],
  reportId: ['reportInstances'],
  scopeId: ['learningPrograms', 'learningSessions', 'activities'],
  sessionId: ['learningSessions'],
  studentId: ['students'],
  teacherId: ['teachers'],
  templateId: ['reportTemplates'],
  targetId: ['activities', 'audioMaterials', 'videoMaterials', 'reportInstances'],
  userId: ['students', 'teachers'],
}
const displayDependenciesByResource: Partial<Record<OpsResource, OpsResource[]>> = {
  activitySignups: ['students', 'activities'],
  auditLogs: ['teachers', 'students'],
  learningSessions: ['learningPrograms'],
  programStudents: ['learningPrograms', 'students'],
  programTeachers: ['learningPrograms', 'teachers'],
  reportEvents: ['reportTemplates', 'learningPrograms', 'learningSessions', 'activities'],
  sessionStudents: ['learningSessions', 'students'],
  sessionTeachers: ['learningSessions', 'teachers'],
}
export const resourceFormFields: Partial<Record<OpsResource, ResourceFormField[]>> = {
  students: [
    { key: 'avatar', label: '头像', type: 'file', accept: 'image/*' },
    { key: 'realName', label: '姓名' },
    { key: 'nickName', label: '昵称' },
    { key: 'cellphone', label: '手机号' },
    { key: 'gender', label: '性别', type: 'select', options: genderOptions },
    { key: 'birthday', label: '生日', type: 'text' },
    { key: 'blocked', label: '禁用账号', type: 'boolean' },
  ],
  teachers: [
    { key: 'avatar', label: '头像', type: 'file', accept: 'image/*' },
    { key: 'realName', label: '姓名' },
    { key: 'nickName', label: '昵称' },
    { key: 'cellphone', label: '手机号' },
    { key: 'gender', label: '性别', type: 'select', options: genderOptions },
    { key: 'birthday', label: '生日', type: 'text' },
    { key: 'verified', label: '审核通过', type: 'boolean' },
    { key: 'blocked', label: '禁用账号', type: 'boolean' },
    { key: 'isAdmin', label: '管理员权限', type: 'boolean' },
  ],
  activities: [
    { key: 'title', label: '标题' },
    { key: 'status', label: '状态', type: 'select', options: labeledOptions({ draft: '草稿', active: '上架', disabled: '停用' }) },
    { key: 'type', label: '类型', type: 'select', options: labeledOptions({ 'open-class': '公开课', trial: '体验课', camp: '训练营', custom: '自定义' }) },
    { key: 'location', label: '地点' },
    { key: 'startTime', label: '开始时间', type: 'datetime' },
    { key: 'endTime', label: '结束时间', type: 'datetime' },
    { key: 'price', label: '价格分', type: 'number' },
    { key: 'maxParticipants', label: '名额', type: 'number' },
    { key: 'sequence', label: '排序', type: 'number' },
    { key: 'coverImage', label: '封面', type: 'file', accept: 'image/*' },
    { key: 'images', label: '图集', type: 'file', accept: 'image/*' },
    { key: 'description', label: '详情', type: 'textarea' },
  ],
  audioMaterials: [
    { key: 'title', label: '标题' },
    { key: 'status', label: '状态', type: 'select', options: publishOptions },
    { key: 'type', label: '类型', type: 'select', options: labeledOptions({ exercise: '练习', demo: '示范', accompaniment: '伴奏', story: '故事' }) },
    { key: 'author', label: '作者' },
    { key: 'language', label: '语言', type: 'select', options: languageOptions },
    { key: 'difficulty', label: '难度', type: 'select', options: difficultyOptions },
    { key: 'sequence', label: '排序', type: 'number' },
    { key: 'coverImage', label: '封面', type: 'file', accept: 'image/*' },
    { key: 'audioSource', label: '音频文件', type: 'file', accept: 'audio/*' },
    { key: 'duration', label: '时长秒', type: 'number' },
    { key: 'description', label: '简介', type: 'textarea' },
  ],
  videoMaterials: [
    { key: 'title', label: '标题' },
    { key: 'status', label: '状态', type: 'select', options: publishOptions },
    { key: 'type', label: '类型', type: 'select', options: labeledOptions({ lesson: '课程', demo: '示范', activity: '活动', replay: '回放' }) },
    { key: 'author', label: '作者' },
    { key: 'language', label: '语言', type: 'select', options: languageOptions },
    { key: 'difficulty', label: '难度', type: 'select', options: difficultyOptions },
    { key: 'resolution', label: '清晰度', type: 'select', options: labeledOptions({ '720p': '高清 720p', '1080p': '全高清 1080p', '4k': '4K' }) },
    { key: 'sequence', label: '排序', type: 'number' },
    { key: 'coverImage', label: '封面', type: 'file', accept: 'image/*' },
    { key: 'videoSource', label: '视频文件', type: 'file', accept: 'video/*' },
    { key: 'duration', label: '时长秒', type: 'number' },
    { key: 'description', label: '简介', type: 'textarea' },
  ],
  operationSlots: [
    { key: 'channel', label: '端', type: 'select', options: labeledOptions({ 'wechat-mini': '微信小程序', 'alipay-mini': '支付宝小程序', app: 'App', web: 'Web' }) },
    { key: 'placement', label: '位置', type: 'select', options: labeledOptions({ 'home-banner': '首页横幅', 'course-card': '课程卡片', 'activity-list': '活动列表', 'report-entry': '报告入口' }) },
    { key: 'title', label: '标题' },
    { key: 'status', label: '状态', type: 'select', options: labeledOptions({ draft: '草稿', active: '启用', inactive: '停用', disabled: '停用' }) },
    { key: 'sortOrder', label: '排序', type: 'number' },
    { key: 'visibleFrom', label: '开始展示', type: 'datetime' },
    { key: 'visibleTo', label: '结束展示', type: 'datetime' },
    { key: 'imageUrl', label: '图片', type: 'file', accept: 'image/*' },
    { key: 'targetType', label: '目标类型', type: 'select', options: labeledOptions({ activity: '活动', audio: '音频', video: '视频', assessment_report: '测评报告', webview: '网页', none: '无跳转' }) },
    { key: 'targetId', label: '目标内容', type: 'relation', relations: ['activities', 'audioMaterials', 'videoMaterials', 'reportInstances'] },
    { key: 'targetUrl', label: '目标 URL' },
  ],
  activitySignups: [
    { key: 'activityId', label: '活动', type: 'relation', relation: 'activities' },
    { key: 'userId', label: '关联学员', type: 'relation', relation: 'students' },
    { key: 'realName', label: '姓名' },
    { key: 'age', label: '年龄', type: 'number' },
    { key: 'status', label: '状态', type: 'select', options: labeledOptions({ registered: '已报名', cancelled: '已取消', attended: '已到场', no_show: '未到场' }) },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  learningPrograms: [
    { key: 'title', label: '学习单元名称' },
    { key: 'type', label: '类型', type: 'select', options: labeledOptions({ course_package: '课程包', trial: '体验课', activity: '活动', custom: '自定义' }) },
    { key: 'status', label: '状态', type: 'select', options: lifecycleOptions },
    { key: 'plannedSessionCount', label: '计划课堂', type: 'number' },
    { key: 'plannedStartAt', label: '计划开始', type: 'datetime' },
    { key: 'plannedEndAt', label: '计划结束', type: 'datetime' },
    { key: 'description', label: '说明', type: 'textarea' },
  ],
  learningSessions: [
    { key: 'programId', label: '所属班级/学习单元', type: 'relation', relation: 'learningPrograms' },
    { key: 'title', label: '课堂标题' },
    { key: 'theme', label: '主题' },
    { key: 'status', label: '状态', type: 'select', options: labeledOptions({ planned: '计划中', completed: '已完成', cancelled: '已取消' }) },
    { key: 'sequence', label: '序号', type: 'number' },
    { key: 'startTime', label: '开始时间', type: 'datetime' },
    { key: 'endTime', label: '结束时间', type: 'datetime' },
  ],
  programStudents: [
    { key: 'programId', label: '班级/学习单元', type: 'relation', relation: 'learningPrograms' },
    { key: 'studentId', label: '学员', type: 'relation', relation: 'students' },
    { key: 'status', label: '状态', type: 'select', options: labeledOptions({ invited: '已邀请', registered: '已报名', active: '学习中', paused: '暂停', completed: '已完成', cancelled: '已取消' }) },
  ],
  programTeachers: [
    { key: 'programId', label: '班级/学习单元', type: 'relation', relation: 'learningPrograms' },
    { key: 'teacherId', label: '教师', type: 'relation', relation: 'teachers' },
    { key: 'role', label: '角色', type: 'select', options: teacherRoleOptions },
    { key: 'status', label: '状态', type: 'select', options: activeOptions },
  ],
  sessionStudents: [
    { key: 'sessionId', label: '课堂/场次', type: 'relation', relation: 'learningSessions' },
    { key: 'studentId', label: '学员', type: 'relation', relation: 'students' },
    { key: 'status', label: '出勤', type: 'select', options: labeledOptions({ scheduled: '已排课', present: '到课', absent: '缺席', late: '迟到', leave: '请假' }) },
  ],
  sessionTeachers: [
    { key: 'sessionId', label: '课堂/场次', type: 'relation', relation: 'learningSessions' },
    { key: 'teacherId', label: '教师', type: 'relation', relation: 'teachers' },
    { key: 'role', label: '角色', type: 'select', options: teacherRoleOptions },
    { key: 'status', label: '状态', type: 'select', options: activeOptions },
  ],
  reportTemplates: [
    { key: 'name', label: '模板名称' },
    { key: 'reportType', label: '报告类型', type: 'select', options: reportTypeOptions },
    { key: 'version', label: '版本', type: 'number' },
    { key: 'status', label: '状态', type: 'select', options: publishOptions },
  ],
  reportEvents: [
    { key: 'title', label: '任务标题' },
    { key: 'reportType', label: '报告类型', type: 'select', options: reportTypeOptions },
    { key: 'templateId', label: '模板', type: 'relation', relation: 'reportTemplates' },
    { key: 'scopeType', label: '范围类型', type: 'select', options: labeledOptions({ program: '班级/学习单元', session: '课堂/场次', activity: '活动', custom: '自定义' }) },
    { key: 'scopeId', label: '范围对象', type: 'relation', relations: ['learningPrograms', 'learningSessions', 'activities'] },
    { key: 'programId', label: '班级/学习单元', type: 'relation', relation: 'learningPrograms' },
    { key: 'sessionId', label: '课堂/场次', type: 'relation', relation: 'learningSessions' },
    { key: 'status', label: '状态', type: 'select', options: labeledOptions({ draft: '草稿', open: '进行中', closed: '已关闭', published: '已发布', cancelled: '已取消' }) },
  ],
}

export function canEditResource(resource: OpsResource): boolean {
  return Boolean(resourceFormFields[resource])
}

export function buildResourceFormState(resource: OpsResource, record: ResourceRecord = { id: '' }): Record<string, ResourceFormValue> {
  return (resourceFormFields[resource] || []).reduce<Record<string, ResourceFormValue>>((state, field) => {
    const value = record[field.key]
    state[field.key] = value === undefined || value === null ? (field.type === 'boolean' ? 'false' : '') : String(value)
    return state
  }, {})
}

export function buildResourcePayload(resource: OpsResource, form: Record<string, ResourceFormValue>): Record<string, unknown> {
  return (resourceFormFields[resource] || []).reduce<Record<string, unknown>>((payload, field) => {
    const raw = form[field.key]
    if (raw === undefined || raw === '') {
      return payload
    }
    payload[field.key] = field.type === 'number' ? Number(raw) : field.type === 'boolean' ? raw === 'true' : raw
    return payload
  }, {})
}

export function getResourceDependencies(resource: OpsResource): OpsResource[] {
  const fields = resourceFormFields[resource] || []
  const dependencies = [
    ...fields.flatMap((field) => field.relations || (field.relation ? [field.relation] : [])),
    ...(displayDependenciesByResource[resource] || []),
  ]
  return [...new Set(dependencies.filter((dependency) => dependency !== resource))]
}

export function resourceFormValueText(value: ResourceFormValue | undefined): string {
  if (isFileValue(value)) {
    return value.name
  }
  return value || ''
}

export function isFileValue(value: unknown): value is File {
  return typeof File !== 'undefined' && value instanceof File
}

export function displayResourceField(resource: OpsResource, key: string, value: unknown, resources: ResourceLookup = {}): string {
  if (value === undefined || value === null || value === '') {
    return '-'
  }
  if (isFileValue(value)) {
    return value.name
  }
  const field = (resourceFormFields[resource] || []).find((item) => item.key === key)
  const stringValue = String(value)
  const relationField = field || { key, label: key, relations: implicitRelationsByKey[key] }
  const option = [...fieldRelationOptions(relationField, resources), ...(field?.options || [])].find((item) => item.value === stringValue)
  if (option) {
    return option.label
  }
  const commonOption = commonFieldLabels[key]?.[stringValue]
  if (commonOption) {
    return commonOption
  }
  if (field?.type === 'file') {
    const segments = stringValue.split('/')
    return segments[segments.length - 1] || stringValue
  }
  return stringValue
}

export function nextPublishStatus(resource: OpsResource, current: unknown): string | null {
  if (resource === 'activities' || resource === 'operationSlots') {
    return current === 'active' ? 'draft' : 'active'
  }
  if (resource === 'audioMaterials' || resource === 'videoMaterials') {
    return current === 'published' ? 'draft' : 'published'
  }
  if (resource === 'learningPrograms') {
    return current === 'active' ? 'draft' : 'active'
  }
  if (resource === 'learningSessions') {
    return current === 'completed' ? 'planned' : 'completed'
  }
  if (resource === 'reportTemplates') {
    return current === 'published' ? 'draft' : 'published'
  }
  if (resource === 'reportEvents') {
    return current === 'open' ? 'closed' : 'open'
  }
  return null
}
