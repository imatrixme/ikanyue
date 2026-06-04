import {
  Activity,
  Archive,
  BadgeCheck,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  MicVocal,
  Radio,
  Settings,
  Share2,
  SquareStack,
  Users,
  Video,
} from 'lucide-react'

import type { NavGroup, NavItem, OpsResource, ResourceLookup, ResourceRecord } from './types'
import { displayResourceField } from './resourceForms'

export const navGroups: NavGroup[] = [
  {
    key: 'workspace',
    label: '工作台',
    items: [
      { view: 'dashboard', label: '总览', icon: LayoutDashboard },
      { view: 'guidedOps', label: '运营流程', icon: CheckCircle2 },
    ],
  },
  {
    key: 'teaching',
    label: '教务核心',
    items: [
      { view: 'students', label: '学员', icon: GraduationCap, section: '人员资料' },
      { view: 'teachers', label: '教师', icon: Users, adminOnly: true, section: '人员资料' },
      { view: 'learningPrograms', label: '教学项目', icon: SquareStack, section: '教学对象' },
      { view: 'learningSessions', label: '实际课次', icon: CalendarRange, section: '教学对象' },
      { view: 'programStudents', label: '项目学员', icon: GraduationCap, section: '参与关系' },
      { view: 'programTeachers', label: '项目教师', icon: Users, section: '参与关系' },
      { view: 'sessionStudents', label: '课次学员', icon: ClipboardCheck, section: '参与关系' },
      { view: 'sessionTeachers', label: '课次教师', icon: Users, section: '参与关系' },
    ],
  },
  {
    key: 'content',
    label: '活动与内容',
    items: [
      { view: 'activities', label: '活动内容', icon: CalendarRange, section: '活动运营' },
      { view: 'activitySignups', label: '活动报名', icon: ClipboardCheck, section: '活动运营' },
      { view: 'operationSlots', label: '运营位', icon: Megaphone, section: '活动运营' },
      { view: 'audioMaterials', label: '音频素材', icon: Radio, section: '素材库' },
      { view: 'videoMaterials', label: '视频素材', icon: Video, section: '素材库' },
    ],
  },
  {
    key: 'reports',
    label: '测评与报告',
    items: [
      { view: 'assessmentWorkspace', label: '评估工作台', icon: MicVocal, section: '填写与查看' },
      { view: 'reports', label: '报告历史', icon: FileText, section: '填写与查看' },
      { view: 'sharePreview', label: '分享预览', icon: Share2, section: '填写与查看' },
      { view: 'assessmentTemplates', label: '评估表模板', icon: BadgeCheck, adminOnly: true, section: '模板配置' },
      { view: 'reportTemplates', label: '报告模板', icon: BadgeCheck, adminOnly: true, section: '模板配置' },
      { view: 'reportEvents', label: '报告事件', icon: ClipboardList, section: '发起与归档' },
      { view: 'reportInstances', label: '报告实例', icon: FileText, section: '发起与归档' },
    ],
  },
  {
    key: 'settings',
    label: '系统设置',
    items: [
      { view: 'systemSettings', label: '系统设置', icon: Settings, adminOnly: true },
      { view: 'auditLogs', label: '审计日志', icon: Archive, adminOnly: true },
    ],
  },
]

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items)

export interface ResourceColumn {
  key: string
  label: string
  render?: (record: ResourceRecord, resources?: ResourceLookup) => string
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
      { key: 'avatar', label: '头像' },
      { key: 'nickName', label: '昵称' },
      { key: 'realName', label: '姓名' },
      { key: 'cellphone', label: '手机号' },
      { key: 'gender', label: '性别', render: (record, resources) => displayResourceField('students', 'gender', record.gender, resources) },
      { key: 'birthday', label: '生日' },
      { key: 'blocked', label: '状态', render: (record) => (record.blocked ? '禁用' : '可用') },
    ],
    createLabel: '新增学员',
  },
  teachers: {
    title: '教师管理',
    description: '审核、启停教师账号，并控制管理员权限。',
    icon: Users,
    columns: [
      { key: 'avatar', label: '头像' },
      { key: 'realName', label: '姓名' },
      { key: 'nickName', label: '昵称' },
      { key: 'cellphone', label: '手机号' },
      { key: 'gender', label: '性别', render: (record, resources) => displayResourceField('teachers', 'gender', record.gender, resources) },
      { key: 'verified', label: '审核', render: (record) => (record.verified ? '已审核' : '待审核') },
      { key: 'blocked', label: '状态', render: (record) => (record.blocked ? '禁用' : '可用') },
      { key: 'isAdmin', label: '角色', render: (record) => (record.isAdmin ? '管理员' : '教师') },
    ],
    createLabel: '新增教师',
  },
  activities: {
    title: '活动内容',
    description: '维护公开课、体验课和校区活动。',
    icon: Activity,
    createLabel: '新建活动',
    columns: [
      { key: 'title', label: '活动' },
      { key: 'type', label: '类型', render: (record, resources) => displayResourceField('activities', 'type', record.type, resources) },
      { key: 'location', label: '地点' },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('activities', 'status', record.status, resources) },
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
      { key: 'difficulty', label: '难度', render: (record, resources) => displayResourceField('audioMaterials', 'difficulty', record.difficulty, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('audioMaterials', 'status', record.status, resources) },
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
      { key: 'resolution', label: '清晰度', render: (record, resources) => displayResourceField('videoMaterials', 'resolution', record.resolution, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('videoMaterials', 'status', record.status, resources) },
    ],
  },
  operationSlots: {
    title: '运营位',
    description: '维护小程序首页、课程页等投放位置。',
    icon: Megaphone,
    createLabel: '新建运营位',
    columns: [
      { key: 'channel', label: '端', render: (record, resources) => displayResourceField('operationSlots', 'channel', record.channel, resources) },
      { key: 'placement', label: '位置', render: (record, resources) => displayResourceField('operationSlots', 'placement', record.placement, resources) },
      { key: 'title', label: '标题' },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('operationSlots', 'status', record.status, resources) },
    ],
  },
  activitySignups: {
    title: '报名审核',
    description: '查看活动报名记录，管理员可更新到场、取消和未到场状态。',
    icon: ClipboardCheck,
    columns: [
      { key: 'realName', label: '姓名' },
      { key: 'userId', label: '关联学员', render: (record, resources) => displayResourceField('activitySignups', 'userId', record.userId, resources) },
      { key: 'activityId', label: '活动', render: (record, resources) => displayResourceField('activitySignups', 'activityId', record.activityId, resources) },
      { key: 'age', label: '年龄' },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('activitySignups', 'status', record.status, resources) },
    ],
  },
  learningPrograms: {
    title: '教学项目',
    description: '承载课包、体验课、活动和临时项目，可不预设固定课次。',
    icon: SquareStack,
    createLabel: '新建项目',
    columns: [
      { key: 'title', label: '项目' },
      { key: 'type', label: '类型', render: (record, resources) => displayResourceField('learningPrograms', 'type', record.type, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('learningPrograms', 'status', record.status, resources) },
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
      { key: 'programId', label: '项目', render: (record, resources) => displayResourceField('learningSessions', 'programId', record.programId, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('learningSessions', 'status', record.status, resources) },
    ],
  },
  programStudents: {
    title: '项目学员',
    description: '维护项目级学员参与关系，课次缺席不影响项目成员关系。',
    icon: GraduationCap,
    createLabel: '添加学员',
    columns: [
      { key: 'programId', label: '项目', render: (record, resources) => displayResourceField('programStudents', 'programId', record.programId, resources) },
      { key: 'studentId', label: '学员', render: (record, resources) => displayResourceField('programStudents', 'studentId', record.studentId, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('programStudents', 'status', record.status, resources) },
    ],
  },
  programTeachers: {
    title: '项目教师',
    description: '维护项目级教师、助教和评估人分工。',
    icon: Users,
    createLabel: '添加教师',
    columns: [
      { key: 'programId', label: '项目', render: (record, resources) => displayResourceField('programTeachers', 'programId', record.programId, resources) },
      { key: 'teacherId', label: '教师', render: (record, resources) => displayResourceField('programTeachers', 'teacherId', record.teacherId, resources) },
      { key: 'role', label: '角色', render: (record, resources) => displayResourceField('programTeachers', 'role', record.role, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('programTeachers', 'status', record.status, resources) },
    ],
  },
  sessionStudents: {
    title: '课次学员',
    description: '维护每堂课的实际学员与到课、缺席等状态。',
    icon: ClipboardCheck,
    createLabel: '添加课次学员',
    columns: [
      { key: 'sessionId', label: '课次', render: (record, resources) => displayResourceField('sessionStudents', 'sessionId', record.sessionId, resources) },
      { key: 'studentId', label: '学员', render: (record, resources) => displayResourceField('sessionStudents', 'studentId', record.studentId, resources) },
      { key: 'status', label: '出勤', render: (record, resources) => displayResourceField('sessionStudents', 'status', record.status, resources) },
    ],
  },
  sessionTeachers: {
    title: '课次教师',
    description: '维护每堂课实际参与的教师、助教和评估人。',
    icon: Users,
    createLabel: '添加课次教师',
    columns: [
      { key: 'sessionId', label: '课次', render: (record, resources) => displayResourceField('sessionTeachers', 'sessionId', record.sessionId, resources) },
      { key: 'teacherId', label: '教师', render: (record, resources) => displayResourceField('sessionTeachers', 'teacherId', record.teacherId, resources) },
      { key: 'role', label: '角色', render: (record, resources) => displayResourceField('sessionTeachers', 'role', record.role, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('sessionTeachers', 'status', record.status, resources) },
    ],
  },
  reportTemplates: {
    title: '报告模板',
    description: '维护学生评估、教师反馈、课次报告和项目总结等报告种类。',
    icon: BadgeCheck,
    createLabel: '新建报告模板',
    columns: [
      { key: 'name', label: '模板' },
      { key: 'reportType', label: '报告类型', render: (record, resources) => displayResourceField('reportTemplates', 'reportType', record.reportType, resources) },
      { key: 'version', label: '版本', render: (record) => String(record.version ?? '-') },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('reportTemplates', 'status', record.status, resources) },
    ],
  },
  reportEvents: {
    title: '报告事件',
    description: '按项目、课次、活动或自定义范围发起报告工作。',
    icon: ClipboardList,
    createLabel: '新建报告事件',
    columns: [
      { key: 'title', label: '事件' },
      { key: 'reportType', label: '类型', render: (record, resources) => displayResourceField('reportEvents', 'reportType', record.reportType, resources) },
      { key: 'scopeType', label: '范围', render: (record, resources) => displayResourceField('reportEvents', 'scopeType', record.scopeType, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('reportEvents', 'status', record.status, resources) },
    ],
  },
  reportInstances: {
    title: '报告实例',
    description: '查看已经生成的学生报告、教师反馈和内部总结。',
    icon: FileText,
    columns: [
      { key: 'title', label: '报告', render: (record) => String(record.title || record.id) },
      { key: 'reportType', label: '类型', render: (record, resources) => displayResourceField('reportInstances', 'reportType', record.reportType, resources) },
      { key: 'recipientType', label: '接收人', render: (record, resources) => displayResourceField('reportInstances', 'recipientType', record.recipientType, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('reportInstances', 'status', record.status, resources) },
    ],
  },
  auditLogs: {
    title: '审计日志',
    description: '记录后台登录、数据变更、评估提交、分享撤销和越权拒绝事件。',
    icon: Archive,
    columns: [
      { key: 'actorId', label: '操作者', render: (record, resources) => displayResourceField('auditLogs', 'actorId', record.actorId, resources) },
      { key: 'action', label: '动作', render: (record, resources) => displayResourceField('auditLogs', 'action', record.action, resources) },
      { key: 'resourceType', label: '资源', render: (record, resources) => displayResourceField('auditLogs', 'resourceType', record.resourceType, resources) },
      { key: 'outcome', label: '结果', render: (record, resources) => displayResourceField('auditLogs', 'outcome', record.outcome, resources) },
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
