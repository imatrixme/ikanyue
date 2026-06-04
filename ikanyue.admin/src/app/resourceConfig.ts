import {
  Activity,
  Archive,
  BadgeCheck,
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  MicVocal,
  Radio,
  Share2,
  SquareStack,
  Users,
  Video,
} from 'lucide-react'

import type { NavItem, OpsResource, ResourceRecord } from './types'

export const navItems: NavItem[] = [
  { view: 'dashboard', label: '总览', icon: LayoutDashboard },
  { view: 'students', label: '学员', icon: GraduationCap },
  { view: 'teachers', label: '教师', icon: Users, adminOnly: true },
  { view: 'activities', label: '活动', icon: CalendarRange },
  { view: 'audioMaterials', label: '音频', icon: Radio },
  { view: 'videoMaterials', label: '视频', icon: Video },
  { view: 'operationSlots', label: '运营位', icon: Megaphone },
  { view: 'activitySignups', label: '报名', icon: ClipboardCheck },
  { view: 'learningPrograms', label: '项目', icon: SquareStack },
  { view: 'learningSessions', label: '课次', icon: CalendarRange },
  { view: 'programStudents', label: '项目学员', icon: GraduationCap },
  { view: 'programTeachers', label: '项目教师', icon: Users },
  { view: 'sessionStudents', label: '课次学员', icon: ClipboardCheck },
  { view: 'sessionTeachers', label: '课次教师', icon: Users },
  { view: 'reportTemplates', label: '报告模板', icon: BadgeCheck, adminOnly: true },
  { view: 'reportEvents', label: '报告事件', icon: ClipboardList },
  { view: 'reportInstances', label: '报告实例', icon: FileText },
  { view: 'auditLogs', label: '审计', icon: Archive, adminOnly: true },
  { view: 'assessmentTemplates', label: '评估表', icon: BadgeCheck, adminOnly: true },
  { view: 'assessmentWorkspace', label: '评估工作台', icon: MicVocal },
  { view: 'reports', label: '报告', icon: FileText },
  { view: 'sharePreview', label: '分享预览', icon: Share2 },
]

export interface ResourceColumn {
  key: string
  label: string
  render?: (record: ResourceRecord) => string
}

export interface ResourceConfig {
  title: string
  description: string
  icon: typeof Archive
  columns: ResourceColumn[]
  createLabel?: string
}

export const resourceConfig: Record<OpsResource, ResourceConfig> = {
  students: {
    title: '学员管理',
    description: '查看老师可服务的学员关系，管理员可全局检索。',
    icon: GraduationCap,
    columns: [
      { key: 'nickName', label: '昵称' },
      { key: 'realName', label: '姓名' },
      { key: 'cellphone', label: '手机号' },
      { key: 'blocked', label: '状态', render: (record) => (record.blocked ? '禁用' : '可用') },
    ],
  },
  teachers: {
    title: '教师管理',
    description: '审核、启停教师账号，并控制管理员权限。',
    icon: Users,
    columns: [
      { key: 'realName', label: '姓名' },
      { key: 'cellphone', label: '手机号' },
      { key: 'verified', label: '审核', render: (record) => (record.verified ? '已审核' : '待审核') },
      { key: 'isAdmin', label: '角色', render: (record) => (record.isAdmin ? '管理员' : '教师') },
    ],
  },
  activities: {
    title: '活动内容',
    description: '维护公开课、体验课和校区活动。',
    icon: Activity,
    createLabel: '新建活动',
    columns: [
      { key: 'title', label: '活动' },
      { key: 'type', label: '类型' },
      { key: 'location', label: '地点' },
      { key: 'status', label: '状态' },
    ],
  },
  audioMaterials: {
    title: '音频素材',
    description: '管理小程序端音频练习和推荐内容。',
    icon: Radio,
    createLabel: '新增音频',
    columns: [
      { key: 'title', label: '标题' },
      { key: 'author', label: '作者' },
      { key: 'difficulty', label: '难度' },
      { key: 'status', label: '状态' },
    ],
  },
  videoMaterials: {
    title: '视频素材',
    description: '管理视频教学素材、封面和上下架。',
    icon: Video,
    createLabel: '新增视频',
    columns: [
      { key: 'title', label: '标题' },
      { key: 'author', label: '作者' },
      { key: 'resolution', label: '清晰度' },
      { key: 'status', label: '状态' },
    ],
  },
  operationSlots: {
    title: '运营位',
    description: '维护小程序首页、课程页等投放位置。',
    icon: Megaphone,
    createLabel: '新建运营位',
    columns: [
      { key: 'channel', label: '端' },
      { key: 'placement', label: '位置' },
      { key: 'title', label: '标题' },
      { key: 'status', label: '状态' },
    ],
  },
  activitySignups: {
    title: '报名审核',
    description: '查看活动报名记录，管理员可更新到场、取消和未到场状态。',
    icon: ClipboardCheck,
    columns: [
      { key: 'realName', label: '姓名' },
      { key: 'activityId', label: '活动' },
      { key: 'age', label: '年龄' },
      { key: 'status', label: '状态' },
    ],
  },
  learningPrograms: {
    title: '教学项目',
    description: '承载课包、体验课、活动和临时项目，可不预设固定课次。',
    icon: SquareStack,
    createLabel: '新建项目',
    columns: [
      { key: 'title', label: '项目' },
      { key: 'type', label: '类型' },
      { key: 'status', label: '状态' },
      { key: 'plannedSessionCount', label: '计划课次', render: (record) => String(record.plannedSessionCount ?? '-') },
    ],
  },
  learningSessions: {
    title: '实际课次',
    description: '记录真实发生的课程、活动场次或一次性体验课。',
    icon: CalendarRange,
    createLabel: '新建课次',
    columns: [
      { key: 'title', label: '课次' },
      { key: 'theme', label: '主题' },
      { key: 'programId', label: '项目' },
      { key: 'status', label: '状态' },
    ],
  },
  programStudents: {
    title: '项目学员',
    description: '维护项目级学员参与关系，课次缺席不影响项目成员关系。',
    icon: GraduationCap,
    createLabel: '添加学员',
    columns: [
      { key: 'programId', label: '项目' },
      { key: 'studentId', label: '学员' },
      { key: 'status', label: '状态' },
    ],
  },
  programTeachers: {
    title: '项目教师',
    description: '维护项目级教师、助教和评估人分工。',
    icon: Users,
    createLabel: '添加教师',
    columns: [
      { key: 'programId', label: '项目' },
      { key: 'teacherId', label: '教师' },
      { key: 'role', label: '角色' },
      { key: 'status', label: '状态' },
    ],
  },
  sessionStudents: {
    title: '课次学员',
    description: '维护每堂课的实际学员与到课、缺席等状态。',
    icon: ClipboardCheck,
    createLabel: '添加课次学员',
    columns: [
      { key: 'sessionId', label: '课次' },
      { key: 'studentId', label: '学员' },
      { key: 'status', label: '出勤' },
    ],
  },
  sessionTeachers: {
    title: '课次教师',
    description: '维护每堂课实际参与的教师、助教和评估人。',
    icon: Users,
    createLabel: '添加课次教师',
    columns: [
      { key: 'sessionId', label: '课次' },
      { key: 'teacherId', label: '教师' },
      { key: 'role', label: '角色' },
      { key: 'status', label: '状态' },
    ],
  },
  reportTemplates: {
    title: '报告模板',
    description: '维护学生评估、教师反馈、课次报告和项目总结等报告种类。',
    icon: BadgeCheck,
    createLabel: '新建报告模板',
    columns: [
      { key: 'name', label: '模板' },
      { key: 'reportType', label: '报告类型' },
      { key: 'version', label: '版本', render: (record) => String(record.version ?? '-') },
      { key: 'status', label: '状态' },
    ],
  },
  reportEvents: {
    title: '报告事件',
    description: '按项目、课次、活动或自定义范围发起报告工作。',
    icon: ClipboardList,
    createLabel: '新建报告事件',
    columns: [
      { key: 'title', label: '事件' },
      { key: 'reportType', label: '类型' },
      { key: 'scopeType', label: '范围' },
      { key: 'status', label: '状态' },
    ],
  },
  reportInstances: {
    title: '报告实例',
    description: '查看已经生成的学生报告、教师反馈和内部总结。',
    icon: FileText,
    columns: [
      { key: 'title', label: '报告', render: (record) => String(record.title || record.id) },
      { key: 'reportType', label: '类型' },
      { key: 'recipientType', label: '接收人' },
      { key: 'status', label: '状态' },
    ],
  },
  auditLogs: {
    title: '审计日志',
    description: '记录后台登录、数据变更、评估提交、分享撤销和越权拒绝事件。',
    icon: Archive,
    columns: [
      { key: 'actorId', label: '操作者' },
      { key: 'action', label: '动作' },
      { key: 'resourceType', label: '资源' },
      { key: 'outcome', label: '结果' },
    ],
  },
}

export const metricIconByKey = {
  students: GraduationCap,
  activities: CalendarRange,
  reports: BookOpen,
  audits: Archive,
  teacherReview: Users,
}
