import type { ListResult, OpsProfile, PointEvent, RewardItem, StudentPointsRow } from './types'

export const mockProfiles: Record<'admin' | 'teacher', OpsProfile> = {
  admin: {
    id: 'admin_1',
    role: 'teacher',
    isAdmin: true,
    nickName: '管理员',
    realName: '运营老师',
    cellphone: '13800138002',
    verified: true,
    blocked: false,
  },
  teacher: {
    id: 'teacher_1',
    role: 'teacher',
    isAdmin: false,
    nickName: '王老师',
    realName: '王老师',
    cellphone: '13800138001',
    verified: true,
    blocked: false,
  },
}

export const mockStudents: ListResult<StudentPointsRow> = list([
  {
    id: 'student_1',
    realName: '张同学',
    nickName: '小张',
    cellphone: '13900139001',
    balance: 120,
  },
  {
    id: 'student_2',
    realName: '李同学',
    nickName: '小李',
    cellphone: '13900139002',
    balance: 40,
  },
])

export const mockRewards: ListResult<RewardItem> = list([
  {
    id: 'reward_sticker',
    name: '贴纸套装',
    description: '线下前台领取的主题贴纸。',
    image: '',
    pointsPrice: 50,
    sortOrder: 1,
    status: 'active',
  },
  {
    id: 'reward_book',
    name: '乐理练习册',
    description: '适合课后复习的纸质练习册。',
    image: '',
    pointsPrice: 200,
    sortOrder: 2,
    status: 'active',
  },
  {
    id: 'reward_hidden',
    name: '下线奖品',
    description: '暂不展示给学员。',
    image: '',
    pointsPrice: 10,
    sortOrder: 3,
    status: 'inactive',
  },
])

export const mockPointEvents: PointEvent[] = [
  {
    id: 'event_2',
    studentId: 'student_1',
    type: 'earn',
    delta: 40,
    balanceAfter: 120,
    reason: '课堂奖励',
    remark: '节奏稳定',
    created: '2026-06-02T08:00:00.000Z',
  },
  {
    id: 'event_1',
    studentId: 'student_1',
    type: 'earn',
    delta: 80,
    balanceAfter: 80,
    reason: 'seed',
    created: '2026-06-01T08:00:00.000Z',
  },
  {
    id: 'event_3',
    studentId: 'student_2',
    type: 'earn',
    delta: 40,
    balanceAfter: 40,
    reason: '到课奖励',
    created: '2026-06-02T09:00:00.000Z',
  },
]

export function list<T>(items: T[], page = 1, perPage = 20): ListResult<T> {
  return {
    items,
    pagination: {
      page,
      perPage,
      totalItems: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / perPage)),
    },
  }
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
