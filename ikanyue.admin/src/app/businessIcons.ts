import alertIcon from '../assets/icons/nav-alert.png'
import bookIcon from '../assets/icons/nav-book.png'
import bookingsIcon from '../assets/icons/nav-bookings.png'
import calendarIcon from '../assets/icons/nav-calendar.png'
import classesIcon from '../assets/icons/nav-classes.png'
import dashboardIcon from '../assets/icons/nav-dashboard.png'
import enrollmentsIcon from '../assets/icons/nav-enrollments.png'
import historyIcon from '../assets/icons/nav-history.png'
import packagesIcon from '../assets/icons/nav-packages.png'
import pointsIcon from '../assets/icons/nav-points.png'
import rewardsIcon from '../assets/icons/nav-rewards.png'
import studentsIcon from '../assets/icons/nav-students.png'
import teachersIcon from '../assets/icons/nav-teachers.png'
import validityIcon from '../assets/icons/nav-validity.png'

import type { CourseResourceKey } from './courseTypes'
import type { AppView } from './types'

export const businessIcons = {
  alert: alertIcon,
  book: bookIcon,
  bookings: bookingsIcon,
  calendar: calendarIcon,
  classes: classesIcon,
  dashboard: dashboardIcon,
  enrollments: enrollmentsIcon,
  history: historyIcon,
  packages: packagesIcon,
  points: pointsIcon,
  rewards: rewardsIcon,
  students: studentsIcon,
  teachers: teachersIcon,
  validity: validityIcon,
} as const

export const viewBusinessIcons: Record<AppView, string> = {
  dashboard: businessIcons.dashboard,
  students: businessIcons.students,
  courses: businessIcons.book,
  packages: businessIcons.packages,
  enrollments: businessIcons.enrollments,
  classes: businessIcons.classes,
  lessons: businessIcons.calendar,
  calendar: businessIcons.calendar,
  appointments: businessIcons.bookings,
  accounts: businessIcons.validity,
  teachers: businessIcons.teachers,
  exceptions: businessIcons.alert,
  audit: businessIcons.history,
  points: businessIcons.points,
  rewards: businessIcons.rewards,
}

export const resourceBusinessIcons: Record<CourseResourceKey, string> = {
  courseSpecs: businessIcons.book,
  packages: businessIcons.packages,
  priceVersions: businessIcons.packages,
  grantLines: businessIcons.validity,
  accounts: businessIcons.validity,
  classes: businessIcons.classes,
  classStudents: businessIcons.students,
  classTeachers: businessIcons.teachers,
  lessons: businessIcons.calendar,
  assignedLessons: businessIcons.calendar,
  sessionClasses: businessIcons.classes,
  sessionStudents: businessIcons.students,
  sessionTeachers: businessIcons.teachers,
  enrollments: businessIcons.enrollments,
  teacherEvents: businessIcons.teachers,
  settlementExceptions: businessIcons.alert,
  auditLogs: businessIcons.history,
  reconciliationExceptions: businessIcons.alert,
}
