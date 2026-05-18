import {
  filterList,
  mockDashboard,
  mockProfiles,
  mockReports,
  mockResources,
  mockSharePreview,
  mockTemplates,
} from './mockData'
import type {
  AssessmentReport,
  AssessmentTemplate,
  DashboardData,
  ListResult,
  LoginResult,
  OpsResource,
  ResourceRecord,
  SharePreview,
} from './types'

export interface OpsApi {
  login(cellphone: string, password: string): Promise<LoginResult>
  dashboard(token: string): Promise<DashboardData>
  listResource(resource: OpsResource, token: string, query?: ListQuery): Promise<ListResult<ResourceRecord>>
  listTemplates(token: string, query?: ListQuery): Promise<ListResult<AssessmentTemplate>>
  listReports(token: string, query?: ListQuery): Promise<ListResult<AssessmentReport>>
  viewShare(token: string): Promise<SharePreview>
}

export interface ListQuery {
  q?: string
  status?: string
}

export function createOpsApi(options: { baseUrl?: string; mock?: boolean } = {}): OpsApi {
  const mock = options.mock ?? import.meta.env.VITE_OPS_API_MOCK === 'true'
  if (mock) {
    return createMockOpsApi()
  }
  return createHttpOpsApi(options.baseUrl || import.meta.env.VITE_OPS_API_BASE || '/ops')
}

export function createMockOpsApi(): OpsApi {
  return {
    async login(cellphone, password) {
      if (!cellphone || !password) {
        throw new Error('手机号和密码不能为空')
      }
      const profile = cellphone.endsWith('2') ? mockProfiles.admin : mockProfiles.teacher
      return { token: `mock-token-${profile.id}`, profile }
    },
    async dashboard() {
      return mockDashboard
    },
    async listResource(resource, _token, query = {}) {
      return filterList(mockResources[resource], query.q)
    },
    async listTemplates() {
      return mockTemplates
    },
    async listReports() {
      return mockReports
    },
    async viewShare() {
      return mockSharePreview
    },
  }
}

function createHttpOpsApi(baseUrl: string): OpsApi {
  return {
    login(cellphone, password) {
      return request<LoginResult>(`${baseUrl}/auth/login`, {
        method: 'POST',
        body: { cellphone, password },
      })
    },
    dashboard(token) {
      return request<DashboardData>(`${baseUrl}/dashboard`, { token })
    },
    listResource(resource, token, query = {}) {
      return request<ListResult<ResourceRecord>>(`${baseUrl}/${resource}${toQuery(query)}`, { token })
    },
    listTemplates(token, query = {}) {
      return request<ListResult<AssessmentTemplate>>(`${baseUrl}/assessment-templates${toQuery(query)}`, { token })
    },
    listReports(token, query = {}) {
      return request<ListResult<AssessmentReport>>(`${baseUrl}/reports${toQuery(query)}`, { token })
    },
    viewShare(token) {
      return request<SharePreview>(`${baseUrl}/share/${token}`)
    },
  }
}

async function request<T>(url: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`
  }
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json()
  if (!response.ok || payload.code !== 10000) {
    throw new Error(payload.message || '运营后台请求失败')
  }
  return payload.data as T
}

function toQuery(query: ListQuery): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value) {
      params.set(key, value)
    }
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}
