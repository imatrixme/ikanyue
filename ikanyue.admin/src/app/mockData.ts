import type {
  AssessmentReport,
  AssessmentTemplate,
  DashboardData,
  ListResult,
  OpsProfile,
  OpsResource,
  ResourceRecord,
  SharePreview,
} from './types'

export const mockProfiles = {
  teacher: {
    id: 'teacher_1',
    role: 'teacher',
    isAdmin: false,
    nickName: '王老师',
    realName: '王老师',
    cellphone: '13800138001',
    verified: true,
    blocked: false,
  } satisfies OpsProfile,
  admin: {
    id: 'admin_1',
    role: 'admin',
    isAdmin: true,
    nickName: '运营管理员',
    realName: '林老师',
    cellphone: '13800138002',
    verified: true,
    blocked: false,
  } satisfies OpsProfile,
}

export const mockDashboard: DashboardData = {
  cards: [
    { key: 'students', label: '学员', value: 186 },
    { key: 'activities', label: '活动', value: 9 },
    { key: 'reports', label: '评估报告', value: 42 },
    { key: 'audits', label: '审计日志', value: 318 },
  ],
  pending: [{ key: 'teacherReview', label: '待审核教师', value: 2 }],
}

export const mockResources: Record<OpsResource, ListResult<ResourceRecord>> = {
  students: list([
    { id: 'student_1', nickName: '小张', realName: '张同学', cellphone: '13900139001', blocked: false },
    { id: 'student_2', nickName: '小李', realName: '李同学', cellphone: '13900139002', blocked: false },
    { id: 'student_3', nickName: 'Echo', realName: '陈同学', cellphone: '13900139003', blocked: true },
  ]),
  teachers: list([
    { id: 'teacher_1', realName: '王老师', cellphone: '13800138001', verified: true, isAdmin: false },
    { id: 'teacher_2', realName: '赵老师', cellphone: '13800138005', verified: false, isAdmin: false },
    { id: 'admin_1', realName: '林老师', cellphone: '13800138002', verified: true, isAdmin: true },
  ]),
  activities: list([
    { id: 'activity_1', title: '周末声乐公开课', type: 'open-class', location: '上海静安', status: 'active' },
    { id: 'activity_2', title: '少儿节奏体验营', type: 'trial', location: '杭州西湖', status: 'draft' },
  ]),
  audioMaterials: list([
    { id: 'audio_1', title: '气息稳定练习', author: '王老师', difficulty: 'L1', status: 'published' },
    { id: 'audio_2', title: '弱起节奏跟唱', author: '赵老师', difficulty: 'L2', status: 'draft' },
  ]),
  videoMaterials: list([
    { id: 'video_1', title: '自然换声区示范', author: '王老师', resolution: '1080p', status: 'published' },
    { id: 'video_2', title: '舞台表情训练', author: '林老师', resolution: '720p', status: 'draft' },
  ]),
  operationSlots: list([
    { id: 'slot_1', channel: 'wechat-mini', placement: 'home-banner', title: '春季测评入口', status: 'active' },
    { id: 'slot_2', channel: 'wechat-mini', placement: 'course-card', title: '一对一体验课', status: 'inactive' },
  ]),
  activitySignups: list([
    { id: 'signup_1', userId: 'student_1', activityId: 'activity_1', realName: '张同学', age: 12, status: 'registered', created: '2026-05-20T09:00:00.000Z' },
    { id: 'signup_2', userId: 'student_2', activityId: 'activity_1', realName: '李同学', age: 10, status: 'attended', created: '2026-05-21T09:00:00.000Z' },
  ]),
  auditLogs: list([
    { id: 'audit_1', actorId: 'admin_1', action: 'ops.assessment_record.submit', resourceType: 'assessment_record', outcome: 'success' },
    { id: 'audit_2', actorId: 'teacher_1', action: 'ops.student.detail', resourceType: 'student', outcome: 'denied' },
  ]),
}

export const mockTemplates: ListResult<AssessmentTemplate> = list([
  {
    id: 'template_1',
    name: '声乐阶段测评',
    version: 1,
    status: 'published',
    schemaJson: {
      sections: [
        {
          key: 'pitch',
          title: '音准',
          weight: 0.35,
          items: [
            {
              key: 'pitch_stability',
              label: '音准稳定性',
              type: 'single_choice',
              required: true,
              options: [
                { value: 'good', label: '稳定', score: 90 },
                { value: 'average', label: '偶有偏差', score: 72 },
              ],
            },
            { key: 'pitch_comment', label: '音准评语', type: 'textarea' },
          ],
        },
        {
          key: 'breath',
          title: '气息',
          weight: 0.4,
          items: [{ key: 'breath_support', label: '气息支撑', type: 'score_slider' }],
        },
        {
          key: 'expression',
          title: '表现力',
          weight: 0.25,
          items: [{ key: 'expression_score', label: '舞台表现', type: 'number_score' }],
        },
      ],
      scoring: {
        type: 'weighted_sum',
        maxScore: 100,
        gradeBands: [
          { min: 90, label: 'A' },
          { min: 80, label: 'B' },
          { min: 60, label: 'C' },
        ],
      },
    },
    scoringJson: {
      type: 'weighted_sum',
      maxScore: 100,
      gradeBands: [
        { min: 90, label: 'A' },
        { min: 80, label: 'B' },
        { min: 60, label: 'C' },
      ],
    },
    reportJson: { title: '声乐阶段评估报告' },
    updated: '2026-05-18T10:00:00.000Z',
  },
  {
    id: 'template_2',
    name: '少儿节奏专项',
    version: 2,
    status: 'draft',
    schemaJson: {
      sections: [{ key: 'rhythm', title: '节奏', weight: 1, items: [{ key: 'rhythm_score', label: '节奏准确度', type: 'number_score' }] }],
      scoring: { type: 'rubric_sum', maxScore: 100, gradeBands: [{ min: 75, label: '达标' }] },
    },
    scoringJson: { type: 'rubric_sum', maxScore: 100, gradeBands: [{ min: 75, label: '达标' }] },
    reportJson: { title: '节奏专项报告' },
    updated: '2026-05-17T10:00:00.000Z',
  },
])

export const mockReports: ListResult<AssessmentReport> = list([
  { id: 'report_1', studentId: 'student_1', teacherId: 'teacher_1', templateId: 'template_1', totalScore: 86.2, grade: 'B', created: '2026-05-18T09:00:00.000Z' },
  { id: 'report_2', studentId: 'student_2', teacherId: 'teacher_1', templateId: 'template_1', totalScore: 73.5, grade: 'C', created: '2026-05-16T09:00:00.000Z' },
])

export const mockSharePreview: SharePreview = {
  id: 'report_1',
  title: '声乐阶段评估报告',
  student: { name: '张同学' },
  teacher: { name: '王老师' },
  score: { totalScore: 86.2, grade: 'B' },
  generatedAt: '2026-05-18T09:00:00.000Z',
}

export function filterList<T extends ResourceRecord>(result: ListResult<T>, search = ''): ListResult<T> {
  const keyword = search.trim()
  if (!keyword) {
    return result
  }
  return list(result.items.filter((item) => Object.values(item).some((value) => String(value ?? '').includes(keyword))))
}

function list<T>(items: T[]): ListResult<T> {
  return {
    items,
    pagination: { page: 1, perPage: 20, totalItems: items.length, totalPages: 1 },
  }
}
