import { Award, BookOpen, CalendarCheck2, CalendarDays, ReceiptText, Settings, SlidersHorizontal, Users, Wallet, type LucideIcon } from 'lucide-react'

import type { AppView, OpsProfile } from './types'

export const viewPaths: Record<AppView, string> = {
  dashboard: '/today',
  students: '/students',
  calendar: '/schedule/calendar',
  lessons: '/schedule/lessons',
  appointments: '/schedule/bookings',
  bookingSettings: '/schedule/booking-settings',
  classes: '/schedule/classes',
  teachers: '/schedule/workload',
  enrollments: '/billing/enrollments',
  payments: '/billing/orders',
  renewals: '/billing/renewals',
  accounts: '/billing/lesson-hours',
  exceptions: '/billing/exceptions',
  audit: '/billing/audit',
  points: '/points/students',
  rewards: '/points/rewards',
  courses: '/settings/courses',
  packages: '/settings/packages',
  venues: '/settings/venues',
  migration: '/settings/migration',
}

// Pre-redesign single-level paths; kept so bookmarks and query deep links keep working.
export const legacyViewPaths: Record<string, AppView> = {
  '/dashboard': 'dashboard',
  '/courses': 'courses',
  '/packages': 'packages',
  '/enrollments': 'enrollments',
  '/classes': 'classes',
  '/lessons': 'lessons',
  '/calendar': 'calendar',
  '/appointments': 'appointments',
  '/lesson-hours': 'accounts',
  '/payments': 'payments',
  '/teacher-workload': 'teachers',
  '/exceptions': 'exceptions',
  '/audit': 'audit',
  '/migration': 'migration',
  '/points': 'points',
  '/rewards': 'rewards',
}

export interface NavigationSection {
  key: string
  label: string
  icon: LucideIcon
  // Folded sections sit under the collapsed 更多 group so the founder sees only daily work first.
  folded?: boolean
  tabs: Array<{ view: AppView; label: string }>
}

export const navigationSections: NavigationSection[] = [
  { key: 'today', label: '今天', icon: CalendarCheck2, tabs: [{ view: 'dashboard', label: '今天' }] },
  { key: 'students', label: '学员', icon: Users, tabs: [{ view: 'students', label: '学员' }] },
  {
    key: 'schedule',
    label: '约课',
    icon: CalendarDays,
    tabs: [
      { view: 'calendar', label: '日历' },
      { view: 'appointments', label: '预约' },
    ],
  },
  {
    key: 'billing',
    label: '收款',
    icon: Wallet,
    tabs: [
      { view: 'payments', label: '订单收款' },
      { view: 'enrollments', label: '报课' },
      { view: 'renewals', label: '待续费' },
    ],
  },
  {
    key: 'settings',
    label: '设置',
    icon: Settings,
    tabs: [
      { view: 'venues', label: '场馆' },
      { view: 'courses', label: '课程' },
      { view: 'packages', label: '课包与价格' },
    ],
  },
  {
    key: 'teaching',
    label: '教学',
    icon: BookOpen,
    folded: true,
    tabs: [
      { view: 'lessons', label: '课堂' },
      { view: 'classes', label: '班级' },
      { view: 'teachers', label: '教师工作量' },
    ],
  },
  {
    key: 'ledger',
    label: '账务',
    icon: ReceiptText,
    folded: true,
    tabs: [
      { view: 'accounts', label: '课时账户' },
      { view: 'exceptions', label: '异常' },
      { view: 'audit', label: '操作记录' },
    ],
  },
  { key: 'points', label: '积分', icon: Award, folded: true, tabs: [{ view: 'points', label: '学员积分' }, { view: 'rewards', label: '实物' }] },
  {
    key: 'advanced',
    label: '高级设置',
    icon: SlidersHorizontal,
    folded: true,
    tabs: [
      { view: 'bookingSettings', label: '预约规则' },
      { view: 'migration', label: '历史迁移' },
    ],
  },
]

export function sectionOf(view: AppView): NavigationSection {
  return navigationSections.find((section) => section.tabs.some((tab) => tab.view === view)) || navigationSections[0]
}

export function isTeacherOnly(profile: OpsProfile) {
  const capabilities = profile.courseCreditCapabilities || []
  return !profile.isAdmin && capabilities.includes('course_credit.teacher') && !capabilities.includes('course_credit.academic')
}

// Teacher-only accounts already see a short menu, so their lesson work is never folded away.
export function foldsNavigation(profile: OpsProfile) {
  return !isTeacherOnly(profile)
}

export function sectionLabel(section: NavigationSection, profile: OpsProfile) {
  return section.key === 'schedule' && isTeacherOnly(profile) ? '我的课表' : section.label
}

export function viewFromPath(pathname: string): AppView {
  const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`)
  const current = Object.entries(viewPaths).find(([, path]) => matches(path))?.[0] as AppView | undefined
  return current || Object.entries(legacyViewPaths).find(([path]) => matches(path))?.[1] || 'dashboard'
}
