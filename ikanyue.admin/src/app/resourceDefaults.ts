import type { OpsResource } from './types'

export function defaultResourcePayload(resource: OpsResource, now = new Date()): Record<string, unknown> {
  const suffix = now.toISOString().slice(5, 16).replace('T', ' ')
  switch (resource) {
    case 'teachers':
      return { realName: `新教师 ${suffix}`, cellphone: '13800000000', verified: false, blocked: true, isAdmin: false }
    case 'activities':
      return { title: `新活动 ${suffix}`, type: 'open-class', status: 'draft', location: '待定' }
    case 'audioMaterials':
      return { title: `新音频 ${suffix}`, author: '待定', status: 'draft', difficulty: 'L1' }
    case 'videoMaterials':
      return { title: `新视频 ${suffix}`, author: '待定', status: 'draft', resolution: '1080p' }
    case 'operationSlots':
      return { channel: 'wechat-mini', placement: 'home-banner', title: `新运营位 ${suffix}`, status: 'draft', targetType: 'none', sortOrder: 100 }
    case 'activitySignups':
      return { realName: '新报名', age: 0, status: 'registered', remark: '' }
    case 'learningPrograms':
      return { title: `新项目 ${suffix}`, type: 'trial', status: 'draft', plannedSessionCount: 0 }
    case 'learningSessions':
      return { title: `新课次 ${suffix}`, theme: '待定', status: 'planned', sequence: 1 }
    case 'programStudents':
      return { programId: '', studentId: '', status: 'active' }
    case 'programTeachers':
      return { programId: '', teacherId: '', role: 'lead', status: 'active' }
    case 'sessionStudents':
      return { sessionId: '', studentId: '', status: 'scheduled' }
    case 'sessionTeachers':
      return { sessionId: '', teacherId: '', role: 'lead', status: 'active' }
    case 'reportTemplates':
      return { name: `新报告模板 ${suffix}`, reportType: 'student_assessment', version: 1, status: 'draft', schemaJson: {}, reportJson: {} }
    case 'reportEvents':
      return { title: `新报告事件 ${suffix}`, reportType: 'student_assessment', templateId: '', scopeType: 'program', scopeId: '', status: 'open' }
    default:
      return { realName: `新学员 ${suffix}`, nickName: '新学员', cellphone: '13900000000', blocked: false }
  }
}
