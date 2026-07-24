import {
  BookOpenCheck,
  CalendarDays,
  ChartNoAxesCombined,
  CircleGauge,
  ClipboardList,
  FileWarning,
  GraduationCap,
  History,
  ListChecks,
  PackageOpen,
  School,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'

import type { AppView } from './types'

export const viewPaths: Record<AppView, string> = {
  dashboard: '/dashboard',
  students: '/students',
  courses: '/courses',
  packages: '/packages',
  enrollments: '/enrollments',
  classes: '/classes',
  lessons: '/lessons',
  accounts: '/lesson-hours',
  teachers: '/teacher-workload',
  exceptions: '/exceptions',
  audit: '/audit',
  points: '/points',
  rewards: '/rewards',
}

export const navigationGroups: Array<{
  label: string
  items: Array<{ view: AppView; label: string; icon: LucideIcon }>
}> = [
  {
    label: '运营总览',
    items: [
      { view: 'dashboard', label: '今日工作台', icon: CircleGauge },
      { view: 'students', label: '学员管理', icon: Users },
    ],
  },
  {
    label: '课程运营',
    items: [
      { view: 'courses', label: '课程规格', icon: GraduationCap },
      { view: 'packages', label: '课包与价格', icon: WalletCards },
      { view: 'enrollments', label: '报课管理', icon: ClipboardList },
      { view: 'classes', label: '班级管理', icon: School },
      { view: 'lessons', label: '课堂管理', icon: CalendarDays },
    ],
  },
  {
    label: '核销与审计',
    items: [
      { view: 'accounts', label: '课时账户', icon: BookOpenCheck },
      { view: 'teachers', label: '教师工作量', icon: ChartNoAxesCombined },
      { view: 'exceptions', label: '异常中心', icon: FileWarning },
      { view: 'audit', label: '操作审计', icon: History },
    ],
  },
  {
    label: '积分运营',
    items: [
      { view: 'points', label: '学员积分', icon: ListChecks },
      { view: 'rewards', label: '实物管理', icon: PackageOpen },
    ],
  },
]

export const viewEyebrows: Record<AppView, string> = {
  dashboard: '课程运营与风险队列',
  students: '账号、课程与班级关系',
  courses: '课程规格与授课约束',
  packages: '课包、发放规则与价格',
  enrollments: '管理员报课与名单同步',
  classes: '班级成员、教师与学期',
  lessons: '排课、出勤与核销',
  accounts: '学员课时余额与来源',
  teachers: '教师授课工作量',
  exceptions: '待处理业务异常',
  audit: '关键操作追踪',
  points: '积分与线下兑换',
  rewards: '实物目录与价格',
}

export function viewFromPath(pathname: string): AppView {
  return (Object.entries(viewPaths).find(([, path]) => pathname === path || pathname.startsWith(`${path}/`))?.[0] as AppView) || 'dashboard'
}
