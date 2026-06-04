import {
  filterList,
  mockDashboard,
  mockProfiles,
  mockReports,
  mockResources,
  mockSharePreview,
  mockTemplates,
} from './mockData'
import { scoreLocalAssessment, type AssessmentAnswers } from './assessment'
import { isFileValue } from './resourceForms'
import type {
  AssessmentRecord,
  AssessmentReport,
  AssessmentReportDetail,
  AssessmentTemplate,
  DashboardData,
  ListResult,
  LoginResult,
  OpsResource,
  RegisterResult,
  ResourceRecord,
  ShareLink,
  SharePreview,
} from './types'

export interface OpsApi {
  login(account: string, password: string): Promise<LoginResult>
  register(data: RegisterPayload): Promise<RegisterResult>
  changePassword(token: string, data: ChangePasswordPayload): Promise<LoginResult>
  dashboard(token: string): Promise<DashboardData>
  listResource(resource: OpsResource, token: string, query?: ListQuery): Promise<ListResult<ResourceRecord>>
  createResource(resource: OpsResource, token: string, data: Record<string, unknown>): Promise<ResourceRecord>
  updateResource(resource: OpsResource, id: string, token: string, data: Record<string, unknown>): Promise<ResourceRecord>
  uploadRichTextImage(token: string, file: File): Promise<RichTextImageUploadResult>
  listTemplates(token: string, query?: ListQuery): Promise<ListResult<AssessmentTemplate>>
  createTemplate(token: string, data: Partial<AssessmentTemplate>): Promise<AssessmentTemplate>
  publishTemplate(token: string, id: string): Promise<AssessmentTemplate>
  createAssessment(token: string, data: CreateAssessmentPayload): Promise<AssessmentRecord>
  saveAssessment(token: string, id: string, data: SaveAssessmentPayload): Promise<AssessmentRecord>
  submitAssessment(token: string, id: string, data?: SaveAssessmentPayload): Promise<{ record: AssessmentRecord; report: AssessmentReport }>
  listReports(token: string, query?: ListQuery): Promise<ListResult<AssessmentReport>>
  getReport(token: string, reportId: string): Promise<AssessmentReportDetail>
  createShareLink(token: string, reportId: string, data?: { expiresAt?: string }): Promise<ShareLink>
  revokeShareLink(token: string, id: string): Promise<ShareLink>
  viewShare(token: string): Promise<SharePreview>
}

export interface ListQuery {
  q?: string
  status?: string
  page?: number
  perPage?: number
  limit?: number
}

export interface CreateAssessmentPayload {
  templateId: string
  studentId: string
  answersJson?: AssessmentAnswers
}

export interface SaveAssessmentPayload {
  answersJson?: AssessmentAnswers
}

export interface RegisterPayload {
  cellphone: string
  password: string
  realName: string
  nickName?: string
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export interface RichTextImageUploadResult {
  id: string
  recordId: string
  collection: string
  filename: string
  mimeType: string
  size: number
  url: string
}

export function createOpsApi(options: { baseUrl?: string; mock?: boolean } = {}): OpsApi {
  const mock = options.mock ?? import.meta.env.VITE_OPS_API_MOCK === 'true'
  if (mock) {
    return createMockOpsApi()
  }
  return createHttpOpsApi(options.baseUrl || import.meta.env.VITE_OPS_API_BASE || '/ops')
}

export function createMockOpsApi(): OpsApi {
  const resources = clone(mockResources)
  const templates = clone(mockTemplates)
  const reports = clone(mockReports)
  const shares: ShareLink[] = []
  const assessments: AssessmentRecord[] = []
  return {
    async login(account, password) {
      if (!account || !password) {
        throw new Error('账号和密码不能为空')
      }
      const profile = account === 'admin' || account.endsWith('2') ? mockProfiles.admin : mockProfiles.teacher
      return { token: `mock-token-${profile.id}`, profile }
    },
    async register(data) {
      if (!data.cellphone || !data.password || !data.realName) {
        throw new Error('手机号、姓名和密码不能为空')
      }
      return {
        status: 'pending_activation',
        message: '注册成功，请等待管理员激活',
        profile: {
          ...mockProfiles.teacher,
          id: `pending-${data.cellphone}`,
          role: 'teacher',
          isAdmin: false,
          cellphone: data.cellphone,
          realName: data.realName,
          nickName: data.nickName || data.realName,
          verified: false,
          blocked: true,
        },
      }
    },
    async changePassword(_token, data) {
      if (!data.currentPassword || !data.newPassword) {
        throw new Error('当前密码和新密码不能为空')
      }
      if (data.newPassword !== data.confirmPassword) {
        throw new Error('两次输入的新密码不一致')
      }
      return { token: 'mock-token-admin_1-changed', profile: { ...mockProfiles.admin, passwordChangeRequired: false } }
    },
    async dashboard() {
      return mockDashboard
    },
    async listResource(resource, _token, query = {}) {
      return filterList(resources[resource], query.q)
    },
    async createResource(resource, _token, data) {
      const created = { id: `${resource}_${resources[resource].items.length + 1}`, ...data } as ResourceRecord
      resources[resource] = prepend(resources[resource], created)
      return created
    },
    async updateResource(resource, id, _token, data) {
      const existing = resources[resource].items.find((item) => item.id === id)
      if (!existing) {
        throw new Error('记录不存在')
      }
      Object.assign(existing, data)
      return existing
    },
    async uploadRichTextImage(_token, file) {
      return {
        id: `rich_text_asset_${Date.now()}`,
        recordId: `rich_text_asset_${Date.now()}`,
        collection: 'ops_rich_text_assets',
        filename: file.name,
        mimeType: file.type || 'image/png',
        size: file.size,
        url: `https://kyoss.abcmem.com/mock-rich-text/${encodeURIComponent(file.name)}`,
      }
    },
    async listTemplates() {
      return templates
    },
    async createTemplate(_token, data) {
      const created = {
        ...templates.items[0],
        ...data,
        id: `template_${templates.items.length + 1}`,
        status: data.status || 'draft',
        version: data.version || 1,
      } as AssessmentTemplate
      templates.items.unshift(created)
      templates.pagination.totalItems = templates.items.length
      return created
    },
    async publishTemplate(_token, id) {
      const template = templates.items.find((item) => item.id === id)
      if (!template) {
        throw new Error('模板不存在')
      }
      template.status = 'published'
      return template
    },
    async createAssessment(_token, data) {
      const record: AssessmentRecord = {
        id: `assessment_${assessments.length + 1}`,
        studentId: data.studentId,
        templateId: data.templateId,
        status: 'draft',
        answersJson: data.answersJson || {},
      }
      assessments.push(record)
      return record
    },
    async saveAssessment(_token, id, data) {
      const record = assessments.find((item) => item.id === id)
      if (!record) {
        throw new Error('评估记录不存在')
      }
      record.answersJson = data.answersJson || record.answersJson
      return record
    },
    async submitAssessment(_token, id, data = {}) {
      const record = assessments.find((item) => item.id === id)
      if (!record) {
        throw new Error('评估记录不存在')
      }
      const template = templates.items.find((item) => item.id === record.templateId) || templates.items[0]
      record.status = 'submitted'
      record.answersJson = data.answersJson || record.answersJson
      const score = scoreLocalAssessment(template, record.answersJson || {})
      record.scoreJson = score
      const report: AssessmentReport = {
        id: `report_${reports.items.length + 1}`,
        studentId: record.studentId,
        teacherId: mockProfiles.teacher.id,
        templateId: record.templateId,
        totalScore: score.totalScore,
        grade: score.grade,
        created: new Date().toISOString(),
      }
      reports.items.unshift(report)
      reports.pagination.totalItems = reports.items.length
      return { record, report }
    },
    async listReports() {
      return reports
    },
    async getReport(_token, reportId) {
      const report = reports.items.find((item) => item.id === reportId)
      if (!report) {
        throw new Error('报告不存在')
      }
      const template = templates.items.find((item) => item.id === report.templateId)
      return {
        id: report.id,
        title: template?.reportJson?.title || '评估报告',
        student: { name: report.studentId },
        teacher: { name: report.teacherId },
        score: {
          totalScore: report.totalScore,
          grade: report.grade,
          sections: [{ key: 'overall', title: '综合表现', score: report.totalScore, maxScore: 100, comment: '系统生成报告快照' }],
        },
        summary: '阶段表现稳定，建议继续跟进练习。',
        recommendations: ['保持每日练声记录', '下次课复盘节奏与气息'],
        sections: [{ key: 'overall', title: '综合表现', score: report.totalScore, maxScore: 100, comment: '系统生成报告快照' }],
        generatedAt: report.created || new Date().toISOString(),
      }
    },
    async createShareLink(_token, reportId) {
      const share = { id: `share_${shares.length + 1}`, reportId, token: `share-token-${reportId}` }
      shares.push(share)
      return share
    },
    async revokeShareLink(_token, id) {
      const share = shares.find((item) => item.id === id)
      if (!share) {
        throw new Error('分享链接不存在')
      }
      share.revokedAt = new Date().toISOString()
      return share
    },
    async viewShare() {
      const share = shares.at(-1)
      const report = reports.items.find((item) => item.id === share?.reportId)
      const template = templates.items.find((item) => item.id === report?.templateId)
      return report ? {
        id: report.id,
        title: template?.reportJson?.title || mockSharePreview.title,
        student: { name: report.studentId },
        teacher: { name: report.teacherId },
        score: { totalScore: report.totalScore, grade: report.grade },
        generatedAt: report.created || new Date().toISOString(),
      } : mockSharePreview
    },
  }
}

function createHttpOpsApi(baseUrl: string): OpsApi {
  return {
    login(account, password) {
      return request<LoginResult>(`${baseUrl}/auth/login`, {
        method: 'POST',
        body: { account, password },
      })
    },
    register(data) {
      return request<RegisterResult>(`${baseUrl}/auth/register`, {
        method: 'POST',
        body: data,
      })
    },
    changePassword(token, data) {
      return request<LoginResult>(`${baseUrl}/auth/change-password`, { method: 'POST', token, body: data })
    },
    dashboard(token) {
      return request<DashboardData>(`${baseUrl}/dashboard`, { token })
    },
    listResource(resource, token, query = {}) {
      return request<ListResult<ResourceRecord>>(`${baseUrl}/${routeResource(resource)}${toQuery(query)}`, { token })
    },
    createResource(resource, token, data) {
      return request<ResourceRecord>(`${baseUrl}/${routeResource(resource)}`, { method: 'POST', token, body: data })
    },
    updateResource(resource, id, token, data) {
      return request<ResourceRecord>(`${baseUrl}/${routeResource(resource)}/${id}`, { method: 'POST', token, body: data })
    },
    uploadRichTextImage(token, file) {
      return request<RichTextImageUploadResult>(`${baseUrl}/uploads/rich-text-image`, { method: 'POST', token, body: { file, source: 'admin-rich-text' } })
    },
    listTemplates(token, query = {}) {
      return request<ListResult<AssessmentTemplate>>(`${baseUrl}/assessment-templates${toQuery(query)}`, { token })
    },
    createTemplate(token, data) {
      return request<AssessmentTemplate>(`${baseUrl}/assessment-templates`, { method: 'POST', token, body: data })
    },
    publishTemplate(token, id) {
      return request<AssessmentTemplate>(`${baseUrl}/assessment-templates/${id}/publish`, { method: 'POST', token })
    },
    createAssessment(token, data) {
      return request<AssessmentRecord>(`${baseUrl}/assessments`, { method: 'POST', token, body: data })
    },
    saveAssessment(token, id, data) {
      return request<AssessmentRecord>(`${baseUrl}/assessments/${id}/save`, { method: 'POST', token, body: data })
    },
    submitAssessment(token, id, data = {}) {
      return request<{ record: AssessmentRecord; report: AssessmentReport }>(`${baseUrl}/assessments/${id}/submit`, { method: 'POST', token, body: data })
    },
    listReports(token, query = {}) {
      return request<ListResult<AssessmentReport>>(`${baseUrl}/reports${toQuery(query)}`, { token })
    },
    getReport(token, reportId) {
      return request<AssessmentReportDetail>(`${baseUrl}/reports/${reportId}`, { token })
    },
    createShareLink(token, reportId, data = {}) {
      return request<ShareLink>(`${baseUrl}/reports/${reportId}/share-links`, { method: 'POST', token, body: data })
    },
    revokeShareLink(token, id) {
      return request<ShareLink>(`${baseUrl}/share-links/${id}/revoke`, { method: 'POST', token })
    },
    viewShare(token) {
      return request<SharePreview>(`${baseUrl}/share/${token}`)
    },
  }
}

function routeResource(resource: OpsResource): string {
  if (resource === 'reportEvents') {
    return 'report-events'
  }
  if (resource === 'reportInstances') {
    return 'report-instances'
  }
  return resource
}

async function request<T>(url: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const multipartBody = toMultipartBody(options.body)
  const headers: Record<string, string> = multipartBody ? {} : { 'content-type': 'application/json' }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`
  }
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : multipartBody || JSON.stringify(options.body),
  })
  const payload = await response.json()
  if (!response.ok || payload.code !== 10000) {
    throw new Error(payload.message || '运营后台请求失败')
  }
  return payload.data as T
}

function toMultipartBody(body: unknown): FormData | null {
  if (!body || typeof body !== 'object' || !Object.values(body).some(isFileValue)) {
    return null
  }
  const formData = new FormData()
  Object.entries(body).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }
    formData.append(key, isFileValue(value) ? value : String(value))
  })
  return formData
}

function toQuery(query: ListQuery): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function prepend<T>(result: ListResult<T>, item: T): ListResult<T> {
  return {
    items: [item, ...result.items],
    pagination: {
      ...result.pagination,
      totalItems: result.pagination.totalItems + 1,
    },
  }
}
