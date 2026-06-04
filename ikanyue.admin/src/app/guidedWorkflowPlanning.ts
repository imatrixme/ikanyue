import type { GuidedAnswers, GuidedAnswerValue, GuidedOperation, GuidedPlan, GuidedPlanFact, GuidedWorkflow, GuidedWorkflowId } from './guidedWorkflowTypes'
import { requiredGuidedStepKeys } from './guidedWorkflowTypes'
import type { OpsResource, ResourceLookup, ResourceRecord } from './types'

export function buildGuidedPlan(workflow: GuidedWorkflow, answers: GuidedAnswers, resources: ResourceLookup = {}): GuidedPlan {
  const title = text(answers.title) || workflow.title
  const operations = buildOperations(workflow, answers)
  return {
    workflowId: workflow.id,
    title,
    facts: [
      fact('time', '时间', timeSummary(answers), bool(answers.timePending)),
      fact('place', '地点', text(answers.location) || '待定', bool(answers.placePending)),
      fact('people', '人物', peopleSummary(answers, resources), bool(answers.peoplePending)),
    ],
    operations,
    scenePlacements: scenePlacements(workflow.id),
    warnings: buildWarnings(answers, operations),
  }
}

export function validateWorkflowSteps(workflow: GuidedWorkflow) {
  const available = new Set(workflow.steps.map((step) => step.key))
  return requiredGuidedStepKeys.filter((key) => !available.has(key))
}

export function relationOptions(resource: OpsResource, resources: ResourceLookup) {
  return (resources[resource]?.items || []).map((record) => ({ value: record.id, label: recordLabel(resource, record) }))
}

export function recordLabel(resource: OpsResource, record: ResourceRecord): string {
  if (resource === 'students' || resource === 'teachers') {
    return String(record.realName || record.nickName || record.cellphone || record.id)
  }
  return String(record.title || record.name || record.realName || record.id)
}

function buildOperations(workflow: GuidedWorkflow, answers: GuidedAnswers): GuidedOperation[] {
  switch (workflow.id) {
    case 'signupActivity':
      return signupActivityOperations(answers)
    case 'trialLesson':
      return teachingOperations(answers, 'trial')
    case 'longTermClass':
      return teachingOperations(answers, 'course_package')
    case 'addLesson':
    case 'attendance':
    case 'scheduleMakeupLesson':
      return lessonOperations(answers)
    case 'reportLaunch':
    case 'closeCoursePeriod':
      return reportOperations(answers)
    case 'publishAudioMaterial':
      return materialOperations(answers, 'audio')
    case 'publishVideoMaterial':
      return materialOperations(answers, 'video')
    case 'promoteContent':
      return [operationSlotOperation(answers)]
    case 'reviewSignup':
      return signupRecordOperations(answers)
    case 'convertSignupToClass':
      return teachingOperations(answers, text(answers.programType) === 'course_package' ? 'course_package' : text(answers.programType) === 'activity' ? 'activity' : 'trial')
  }
}

function signupActivityOperations(answers: GuidedAnswers): GuidedOperation[] {
  const title = text(answers.title) || '可报名活动'
  const operations: GuidedOperation[] = [
    operation('activity', 'activities', '创建活动', {
      title,
      type: text(answers.activityType) || 'trial',
      status: 'active',
      location: text(answers.location) || '待定',
      startTime: nullableText(answers.startTime),
      endTime: nullableText(answers.endTime),
      maxParticipants: numberValue(answers.capacity),
      description: text(answers.description),
    }),
    operation('slot', 'operationSlots', '创建小程序报名入口', {
      channel: 'wechat-mini',
      placement: 'activity-list',
      title,
      status: 'active',
      targetType: 'activity',
      targetId: ref('activity'),
      metadata: { signupMode: text(answers.signupMode), classRule: text(answers.classRule) },
    }, ['activity']),
  ]
  if (text(answers.sessionRule) !== 'pending') {
    operations.push(...teachingOperations({ ...answers, title: `${title} 教学安排`, theme: title }, 'activity'))
  }
  if (bool(answers.reportAfterActivity)) {
    operations.push(reportEventOperation(answers, 'activity', ref('activity'), '活动后测评'))
  }
  return operations
}

function teachingOperations(answers: GuidedAnswers, programType: 'trial' | 'course_package' | 'activity'): GuidedOperation[] {
  const title = text(answers.title) || (programType === 'course_package' ? '长期课程' : '体验课')
  const operations: GuidedOperation[] = [
    operation('program', 'learningPrograms', '创建教学项目/班级单元', {
      title,
      type: programType,
      status: 'active',
      description: text(answers.description) || text(answers.theme),
      plannedSessionCount: numberValue(answers.sessionCount),
      plannedStartAt: nullableText(answers.startTime),
      plannedEndAt: nullableText(answers.endTime),
      metadata: {
        classSize: text(answers.classSize),
        location: text(answers.location) || '待定',
        ownerName: text(answers.ownerName),
        pending: pendingFlags(answers),
      },
    }),
  ]
  selectedIds(answers.studentIds).forEach((studentId, index) => {
    operations.push(operation(`programStudent${index}`, 'programStudents', '添加项目学员', {
      programId: ref('program'),
      studentId,
      status: 'active',
    }, ['program']))
  })
  selectedIds(answers.teacherIds).forEach((teacherId, index) => {
    operations.push(operation(`programTeacher${index}`, 'programTeachers', '添加项目老师', {
      programId: ref('program'),
      teacherId,
      role: index === 0 ? 'lead' : 'assistant',
      status: 'active',
    }, ['program']))
  })
  if (text(answers.sessionRule) !== 'pending') {
    operations.push(...sessionOperations(answers, ref('program')))
  }
  if (bool(answers.reportAfterActivity)) {
    operations.push(reportEventOperation(answers, 'program', ref('program'), '阶段测评报告'))
  }
  return operations
}

function lessonOperations(answers: GuidedAnswers): GuidedOperation[] {
  const operations = sessionOperations(answers, text(answers.programId) || '')
  if (bool(answers.reportAfterActivity)) {
    operations.push(reportEventOperation(answers, 'session', ref('session'), '课后反馈报告'))
  }
  return operations
}

function sessionOperations(answers: GuidedAnswers, programId: unknown): GuidedOperation[] {
  const title = text(answers.title) || '新课次'
  const operations: GuidedOperation[] = [
    operation('session', 'learningSessions', '创建实际课次', {
      programId,
      title,
      theme: text(answers.theme) || title,
      status: 'planned',
      sequence: 1,
      startTime: nullableText(answers.startTime),
      endTime: nullableText(answers.endTime),
      metadata: { location: text(answers.location) || '待定', ownerName: text(answers.ownerName), pending: pendingFlags(answers) },
    }),
  ]
  selectedIds(answers.studentIds).forEach((studentId, index) => {
    operations.push(operation(`sessionStudent${index}`, 'sessionStudents', '添加课次学员', {
      sessionId: ref('session'),
      studentId,
      status: bool(answers.attendanceRequired) ? 'present' : 'scheduled',
    }, ['session']))
  })
  selectedIds(answers.teacherIds).forEach((teacherId, index) => {
    operations.push(operation(`sessionTeacher${index}`, 'sessionTeachers', '添加课次老师', {
      sessionId: ref('session'),
      teacherId,
      role: index === 0 ? 'lead' : 'assistant',
      status: 'active',
    }, ['session']))
  })
  return operations
}

function reportOperations(answers: GuidedAnswers): GuidedOperation[] {
  return [reportEventOperation(answers, text(answers.scopeType) || 'custom', '', '创建报告事件')]
}

function materialOperations(answers: GuidedAnswers, kind: 'audio' | 'video'): GuidedOperation[] {
  const title = text(answers.title) || (kind === 'audio' ? '新音频素材' : '新视频素材')
  const resource = kind === 'audio' ? 'audioMaterials' : 'videoMaterials'
  const materialKey = kind === 'audio' ? 'audioMaterial' : 'videoMaterial'
  const operations: GuidedOperation[] = [
    operation(materialKey, resource, kind === 'audio' ? '创建音频素材' : '创建视频素材', {
      title,
      type: text(answers.materialType) || (kind === 'audio' ? 'exercise' : 'lesson'),
      status: text(answers.publishStatus) || 'draft',
      author: text(answers.author) || text(answers.ownerName),
      difficulty: text(answers.difficulty) || 'L1',
      resolution: kind === 'video' ? '1080p' : undefined,
      coverImage: fileOrText(answers.coverImage),
      [kind === 'audio' ? 'audioSource' : 'videoSource']: fileOrText(answers.materialFile),
      description: text(answers.description),
      metadata: { audience: text(answers.audience), pending: pendingFlags(answers) },
    }),
  ]
  if (bool(answers.createSlot)) {
    operations.push(operationSlotOperation({ ...answers, targetType: kind, title: `${title} 投放`, targetId: ref(materialKey) }, materialKey))
  }
  return operations
}

function operationSlotOperation(answers: GuidedAnswers, dependency?: string): GuidedOperation {
  const targetType = text(answers.targetType) || 'activity'
  const dependsOn = dependency ? [dependency] : []
  return operation('slot', 'operationSlots', '创建小程序运营位', {
    channel: 'wechat-mini',
    placement: text(answers.placement) || 'home-banner',
    title: text(answers.title) || '小程序投放',
    status: text(answers.publishStatus) || 'active',
    sortOrder: numberValue(answers.sortOrder) || 100,
    visibleFrom: nullableText(answers.startTime),
    visibleTo: nullableText(answers.endTime),
    targetType,
    targetId: text(answers.targetId),
    targetUrl: text(answers.targetUrl),
    metadata: { audience: text(answers.audience), ownerName: text(answers.ownerName), pending: pendingFlags(answers) },
  }, dependsOn)
}

function signupRecordOperations(answers: GuidedAnswers): GuidedOperation[] {
  return [
    operation('signup', 'activitySignups', '创建报名记录', {
      activityId: text(answers.activityId),
      userId: selectedIds(answers.studentIds)[0] || text(answers.userId),
      realName: text(answers.realName) || text(answers.title) || '新报名',
      age: numberValue(answers.age) || 0,
      status: text(answers.signupStatus) || 'registered',
      remark: text(answers.remark),
      metadata: {
        source: text(answers.location),
        ownerName: text(answers.ownerName),
        signupAt: nullableText(answers.startTime),
        pending: pendingFlags(answers),
      },
    }),
  ]
}

function reportEventOperation(answers: GuidedAnswers, scopeType: string, scopeId: unknown, fallbackTitle: string): GuidedOperation {
  return operation('reportEvent', 'reportEvents', fallbackTitle, {
    title: text(answers.title) || fallbackTitle,
    reportType: text(answers.reportType) || 'student_assessment',
    templateId: selectedIds(answers.templateIds)[0] || text(answers.templateId),
    scopeType,
    scopeId,
    status: text(answers.reportStatus) || 'open',
    subjectRulesJson: { studentIds: selectedIds(answers.studentIds), teacherIds: selectedIds(answers.teacherIds) },
    recipientRulesJson: { autoPublish: bool(answers.autoPublish) },
    metadata: { location: text(answers.location), ownerName: text(answers.ownerName), pending: pendingFlags(answers) },
  })
}

function operation(key: string, resource: OpsResource, label: string, payload: Record<string, unknown>, dependsOn: string[] = []): GuidedOperation {
  return { key, resource, label, payload, dependsOn }
}

function fact(key: GuidedPlanFact['key'], label: string, value: string, pending: boolean): GuidedPlanFact {
  return { key, label, value: pending ? `${value || '待定'}（待定）` : value || '待定', pending }
}

function timeSummary(answers: GuidedAnswers): string {
  const start = text(answers.startTime)
  const end = text(answers.endTime)
  return start && end ? `${start} 至 ${end}` : start || end || '待定'
}

function peopleSummary(answers: GuidedAnswers, resources: ResourceLookup): string {
  const teacherNames = selectedIds(answers.teacherIds).map((id) => {
    const teacher = resources.teachers?.items.find((item) => item.id === id)
    return teacher ? recordLabel('teachers', teacher) : id
  })
  return [...teacherNames, text(answers.ownerName)].filter(Boolean).join('、') || '待分配'
}

function buildWarnings(answers: GuidedAnswers, operations: GuidedOperation[]): string[] {
  const warnings: string[] = []
  if (!text(answers.startTime) && !bool(answers.timePending)) {
    warnings.push('时间未填写，将按待定处理。')
  }
  if (!text(answers.location) && !bool(answers.placePending)) {
    warnings.push('地点未填写，将按待定处理。')
  }
  if (selectedIds(answers.teacherIds).length === 0 && !bool(answers.peoplePending)) {
    warnings.push('老师或负责人未选择，将按待分配处理。')
  }
  if (operations.length === 0) {
    warnings.push('当前答案没有生成任何操作。')
  }
  return warnings
}

function scenePlacements(id: GuidedWorkflowId): string[] {
  const common = ['高级数据维护']
  const map: Record<GuidedWorkflowId, string[]> = {
    signupActivity: ['活动中心', '报名中心', '课次中心', '报告中心', ...common],
    trialLesson: ['班级中心', '课次中心', '学员中心', '报告中心', ...common],
    longTermClass: ['班级中心', '课程项目', '课表', '学员中心', '老师中心', ...common],
    addLesson: ['课次中心', '班级详情', '老师日程', '学员学习记录', ...common],
    attendance: ['课次中心', '出勤记录', '补课队列', '报告队列', ...common],
    reportLaunch: ['测评报告中心', '学员画像', '老师中心', '班级/活动详情', ...common],
    publishAudioMaterial: ['素材库', '课程卡片', '小程序运营位', ...common],
    publishVideoMaterial: ['素材库', '课程卡片', '小程序运营位', ...common],
    promoteContent: ['小程序首页', '活动中心', '素材中心', ...common],
    reviewSignup: ['报名中心', '活动详情', '转化队列', ...common],
    convertSignupToClass: ['项目中心', '课次中心', '学员中心', '老师中心', ...common],
    scheduleMakeupLesson: ['补课队列', '课次中心', '老师日程', '学员学习记录', ...common],
    closeCoursePeriod: ['项目中心', '测评报告中心', '学员画像', '老师中心', ...common],
  }
  return map[id]
}

function pendingFlags(answers: GuidedAnswers): Record<string, boolean> {
  return { time: bool(answers.timePending), place: bool(answers.placePending), people: bool(answers.peoplePending), students: bool(answers.studentsPending) }
}

function selectedIds(value: GuidedAnswerValue | undefined): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function text(value: GuidedAnswerValue | undefined): string {
  if (typeof File !== 'undefined' && value instanceof File) {
    return value.name
  }
  return typeof value === 'string' ? value.trim() : value === undefined || Array.isArray(value) ? '' : String(value)
}

function fileOrText(value: GuidedAnswerValue | undefined): File | string | undefined {
  if (typeof File !== 'undefined' && value instanceof File) {
    return value
  }
  return nullableText(value)
}

function nullableText(value: GuidedAnswerValue | undefined): string | undefined {
  return text(value) || undefined
}

function numberValue(value: GuidedAnswerValue | undefined): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function bool(value: GuidedAnswerValue | undefined): boolean {
  return value === true
}

function ref(key: string): string {
  return `{{${key}.id}}`
}
