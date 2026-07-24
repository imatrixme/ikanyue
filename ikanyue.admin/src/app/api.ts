import { clone, list, mockPointEvents, mockProfiles, mockRewards, mockStudents } from './mockData'
import { createHttpCourseOpsApi, createMockCourseOpsApi, type CourseOpsApi } from './courseApi'
import type { CoursePage } from './courseTypes'
import { request, toQuery } from './http'
import type {
  AddPointsInput,
  ListResult,
  LoginResult,
  OfflineRedeemInput,
  RegisterResult,
  RewardItem,
  RewardItemInput,
  StudentInput,
  StudentRecord,
  StudentPointSummary,
  StudentPointsRow,
  UploadProgressHandler,
} from './types'

export interface OpsApi extends CourseOpsApi {
  login(account: string, password: string): Promise<LoginResult>
  register(data: RegisterPayload): Promise<RegisterResult>
  changePassword(token: string, data: ChangePasswordPayload): Promise<LoginResult>
  listManagedStudents(token: string, query?: ListQuery): Promise<ListResult<StudentRecord>>
  listAssignedStudents(token: string, query?: ListQuery): Promise<ListResult<StudentRecord>>
  createStudent(token: string, data: StudentInput): Promise<StudentRecord>
  updateStudent(token: string, id: string, data: StudentInput): Promise<StudentRecord>
  listStudents(token: string, query?: ListQuery): Promise<ListResult<StudentPointsRow>>
  getStudentPoints(token: string, studentId: string, query?: ListQuery): Promise<StudentPointSummary>
  addPoints(token: string, data: AddPointsInput): Promise<StudentPointSummary>
  offlineRedeem(token: string, data: OfflineRedeemInput): Promise<StudentPointSummary>
  listRewards(token: string, query?: ListQuery): Promise<ListResult<RewardItem>>
  createReward(token: string, data: RewardItemInput): Promise<RewardItem>
  updateReward(token: string, id: string, data: RewardItemInput): Promise<RewardItem>
  uploadRewardImage(token: string, id: string, file: File, onProgress?: UploadProgressHandler): Promise<RewardItem>
}

export interface ListQuery {
  q?: string
  keyword?: string
  status?: string
  page?: number
  perPage?: number
  limit?: number
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

export function createOpsApi(options: { baseUrl?: string; mock?: boolean } = {}): OpsApi {
  const mock = options.mock ?? import.meta.env.VITE_OPS_API_MOCK === 'true'
  if (mock) {
    return createMockOpsApi()
  }
  return createHttpOpsApi(options.baseUrl || import.meta.env.VITE_OPS_API_BASE || '/ops')
}

export function createMockOpsApi(): OpsApi {
  const students = clone(mockStudents)
  const blockedStudentIds = new Set<string>()
  const managedStudents: StudentRecord[] = students.items.map((student, index) => ({
    avatar: student.avatar || '',
    blocked: false,
    cellphone: student.cellphone,
    created: `2026-06-0${index + 1}T08:00:00.000Z`,
    id: student.id,
    lastLoginAt: '',
    nickName: student.nickName,
    realName: student.realName,
    updated: `2026-06-0${index + 1}T08:00:00.000Z`,
    classAssignments: index === 0 ? [{ id: 'class_student_1', classId: 'class_1', studentId: student.id, status: 'active' }] : [],
    lessonAssignments: index === 0 ? [{ id: 'session_student_1', sessionId: 'lesson_1', studentId: student.id, attendanceStatus: 'scheduled' }] : [],
  }))
  const rewards = clone(mockRewards)
  const events = clone(mockPointEvents)

  return {
    ...createMockCourseOpsApi(),
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
    async listManagedStudents(_token, query = {}) {
      const keyword = String(query.q || query.keyword || '').trim()
      const status = String(query.status || '')
      const items = managedStudents.filter((student) => (!keyword || searchableStudent(student).includes(keyword)) && (!status || status === 'all' || student.blocked === (status === 'inactive')))
      return list(items, Number(query.page || 1), Number(query.perPage || query.limit || 100))
    },
    async listAssignedStudents(_token, query = {}) {
      const keyword = String(query.q || query.keyword || '').trim()
      const status = String(query.status || '')
      const items = managedStudents.filter((student) => (student.classAssignments?.length || student.lessonAssignments?.length) && (!keyword || searchableStudent(student).includes(keyword)) && (!status || status === 'all' || student.blocked === (status === 'inactive')))
      return list(items, Number(query.page || 1), Number(query.perPage || query.limit || 100))
    },
    async createStudent(_token, data) {
      validateStudent(data, managedStudents)
      const student: StudentRecord = { avatar: '', blocked: Boolean(data.blocked), cellphone: data.cellphone.trim(), created: new Date().toISOString(), id: `student_${managedStudents.length + 1}`, lastLoginAt: '', nickName: data.nickName?.trim() || '', realName: data.realName.trim(), updated: new Date().toISOString() }
      managedStudents.unshift(student)
      students.items.unshift({ id: student.id, realName: student.realName, nickName: student.nickName, cellphone: student.cellphone, balance: 0 })
      if (student.blocked) blockedStudentIds.add(student.id)
      return clone(student)
    },
    async updateStudent(_token, id, data) {
      const index = managedStudents.findIndex((student) => student.id === id)
      if (index < 0) throw new Error('学员不存在')
      validateStudent(data, managedStudents, id, false)
      managedStudents[index] = { ...managedStudents[index], blocked: Boolean(data.blocked), cellphone: data.cellphone.trim(), nickName: data.nickName?.trim() || '', realName: data.realName.trim(), updated: new Date().toISOString() }
      const pointsRow = students.items.find((student) => student.id === id)
      if (pointsRow) Object.assign(pointsRow, { cellphone: data.cellphone.trim(), nickName: data.nickName?.trim() || '', realName: data.realName.trim() })
      if (data.blocked) blockedStudentIds.add(id)
      else blockedStudentIds.delete(id)
      return clone(managedStudents[index])
    },
    async listStudents(_token, query = {}) {
      const keyword = String(query.q || query.keyword || '').trim()
      const activeStudents = students.items.filter((student) => !blockedStudentIds.has(student.id))
      const items = keyword
        ? activeStudents.filter((student) => searchableStudent(student).includes(keyword))
        : activeStudents
      return list(items, Number(query.page || 1), Number(query.perPage || query.limit || 20))
    },
    async getStudentPoints(_token, studentId, query = {}) {
      const student = findStudent(students.items, studentId)
      const studentEvents = events.filter((event) => event.studentId === student.id)
      return {
        balance: student.balance,
        events: studentEvents,
        pagination: list(studentEvents, Number(query.page || 1), Number(query.perPage || 20)).pagination,
        studentId: student.id,
      }
    },
    async addPoints(_token, data) {
      const student = findStudent(students.items, data.studentId)
      const amount = Number(data.amount)
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('积分必须为正整数')
      }
      student.balance += amount
      events.unshift({
        id: `event_${events.length + 1}`,
        balanceAfter: student.balance,
        created: new Date().toISOString(),
        delta: amount,
        reason: data.reason || 'admin_grant',
        remark: data.remark || '',
        studentId: student.id,
        type: 'earn',
      })
      return this.getStudentPoints(_token, student.id)
    },
    async offlineRedeem(_token, data) {
      const student = findStudent(students.items, data.studentId)
      const reward = rewards.items.find((item) => item.id === data.itemId && item.status === 'active')
      if (!reward) {
        throw new Error('实物已下线，无法兑换')
      }
      if (student.balance < reward.pointsPrice) {
        throw new Error('积分不足，无法兑换该实物')
      }
      student.balance -= reward.pointsPrice
      events.unshift({
        id: `event_${events.length + 1}`,
        balanceAfter: student.balance,
        created: new Date().toISOString(),
        delta: -reward.pointsPrice,
        reason: 'offline_redeem',
        remark: data.remark || '',
        rewardItemId: reward.id,
        rewardSnapshot: { id: reward.id, name: reward.name, pointsPrice: reward.pointsPrice },
        studentId: student.id,
        type: 'offline_redeem',
      })
      return { ...(await this.getStudentPoints(_token, student.id)), reward }
    },
    async listRewards(_token, query = {}) {
      const status = String(query.status || '')
      const items = status ? rewards.items.filter((item) => item.status === status) : rewards.items
      return list(items, Number(query.page || 1), Number(query.perPage || query.limit || 50))
    },
    async createReward(_token, data) {
      const reward = normalizeRewardInput(data, `reward_${rewards.items.length + 1}`)
      rewards.items.unshift(reward)
      rewards.pagination.totalItems = rewards.items.length
      return reward
    },
    async updateReward(_token, id, data) {
      const reward = rewards.items.find((item) => item.id === id)
      if (!reward) {
        throw new Error('实物不存在')
      }
      Object.assign(reward, normalizeRewardInput({ ...reward, ...data }, id))
      return reward
    },
    async uploadRewardImage(_token, id, file, onProgress) {
      const reward = rewards.items.find((item) => item.id === id)
      if (!reward) {
        throw new Error('实物不存在')
      }
      onProgress?.(100)
      reward.image = `https://mock-assets.test/${encodeURIComponent(id)}/${encodeURIComponent(file.name)}`
      return clone(reward)
    },
  }
}

function createHttpOpsApi(baseUrl: string): OpsApi {
  return {
    ...createHttpCourseOpsApi(baseUrl),
    login(account, password) {
      return request<LoginResult>(`${baseUrl}/auth/login`, {
        method: 'POST',
        body: { account, username: account, password },
      })
    },
    register(data) {
      return request<RegisterResult>(`${baseUrl}/auth/register`, { method: 'POST', body: data })
    },
    changePassword(token, data) {
      return request<LoginResult>(`${baseUrl}/auth/change-password`, { method: 'POST', token, body: data })
    },
    listManagedStudents(token, query = {}) {
      return request<ListResult<StudentRecord>>(`${baseUrl}/students${toQuery(query)}`, { token })
    },
    async listAssignedStudents(token, query = {}) {
      const page = await request<CoursePage<StudentRecord>>(`${baseUrl}/course-credits/assigned-students${toQuery(query)}`, { token })
      return coursePageToListResult(page)
    },
    createStudent(token, data) {
      return request<StudentRecord>(`${baseUrl}/students`, { method: 'POST', token, body: data })
    },
    updateStudent(token, id, data) {
      return request<StudentRecord>(`${baseUrl}/students/${encodeURIComponent(id)}`, { method: 'POST', token, body: data })
    },
    listStudents(token, query = {}) {
      return request<ListResult<StudentPointsRow>>(`${baseUrl}/points/students${toQuery(query)}`, { token })
    },
    getStudentPoints(token, studentId, query = {}) {
      return request<StudentPointSummary>(`${baseUrl}/points/students/${encodeURIComponent(studentId)}${toQuery(query)}`, { token })
    },
    async addPoints(token, data) {
      await request<unknown>(`${baseUrl}/points/students/${encodeURIComponent(data.studentId)}/earn`, {
        method: 'POST',
        token,
        body: data,
      })
      return request<StudentPointSummary>(`${baseUrl}/points/students/${encodeURIComponent(data.studentId)}`, { token })
    },
    async offlineRedeem(token, data) {
      await request<unknown>(`${baseUrl}/points/offline-redeem`, { method: 'POST', token, body: data })
      return request<StudentPointSummary>(`${baseUrl}/points/students/${encodeURIComponent(data.studentId)}`, { token })
    },
    listRewards(token, query = {}) {
      return request<ListResult<RewardItem>>(`${baseUrl}/reward-items${toQuery(query)}`, { token })
    },
    createReward(token, data) {
      return request<RewardItem>(`${baseUrl}/reward-items`, { method: 'POST', token, body: data })
    },
    updateReward(token, id, data) {
      return request<RewardItem>(`${baseUrl}/reward-items/${encodeURIComponent(id)}`, { method: 'POST', token, body: data })
    },
    uploadRewardImage(token, id, file, onProgress) {
      return uploadRequest<RewardItem>(`${baseUrl}/reward-items/${encodeURIComponent(id)}/image`, token, file, onProgress)
    },
  }
}

function coursePageToListResult<T>(page: CoursePage<T>): ListResult<T> {
  return {
    items: page.items,
    pagination: {
      page: page.page,
      perPage: page.perPage,
      totalItems: page.totalItems,
      totalPages: page.totalPages,
    },
  }
}

function validateStudent(data: StudentInput, students: StudentRecord[], ignoredId = '', requirePassword = true) {
  if (!data.cellphone.trim()) throw new Error('手机号不能为空')
  if (!data.realName.trim()) throw new Error('学员姓名不能为空')
  if (requirePassword && !data.password?.trim()) throw new Error('初始密码不能为空')
  if (students.some((student) => student.id !== ignoredId && student.cellphone === data.cellphone.trim())) throw new Error('手机号已注册')
}

function uploadRequest<T>(url: string, token: string, file: File, onProgress?: UploadProgressHandler): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onerror = () => reject(new Error('图片上传失败，请检查网络后重试'))
    xhr.onload = () => {
      let payload: { code?: number; data?: T; message?: string }
      try {
        payload = JSON.parse(xhr.responseText) as { code?: number; data?: T; message?: string }
      } catch {
        reject(new Error('图片上传返回了无效响应'))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300 || payload.code !== 10000 || payload.data === undefined) {
        reject(new Error(payload.message || '图片上传失败'))
        return
      }
      onProgress?.(100)
      resolve(payload.data)
    }

    const body = new FormData()
    body.set('imageFile', file)
    onProgress?.(0)
    xhr.send(body)
  })
}

function findStudent(students: StudentPointsRow[], studentId: string) {
  const student = students.find((item) => item.id === studentId)
  if (!student) {
    throw new Error('学员不存在')
  }
  return student
}

function searchableStudent(student: Pick<StudentPointsRow, 'realName' | 'nickName' | 'cellphone'>) {
  return `${student.realName} ${student.nickName} ${student.cellphone}`
}

function normalizeRewardInput(data: RewardItemInput, id: string): RewardItem {
  const name = String(data.name || '').trim()
  const pointsPrice = Number(data.pointsPrice)
  if (!name) {
    throw new Error('实物名称不能为空')
  }
  if (!Number.isInteger(pointsPrice) || pointsPrice <= 0) {
    throw new Error('实物积分价格必须为正整数')
  }
  return {
    description: String(data.description || '').trim(),
    id,
    image: String(data.image || '').trim(),
    name,
    pointsPrice,
    sortOrder: Number(data.sortOrder || 0),
    status: data.status === 'inactive' ? 'inactive' : 'active',
  }
}
