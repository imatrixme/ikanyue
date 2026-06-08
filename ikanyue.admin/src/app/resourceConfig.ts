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
  HeartHandshake,
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
    icon: LayoutDashboard,
    items: [
      { view: 'dashboard', label: '今日待办', icon: LayoutDashboard },
      { view: 'guidedOps', label: '新建事务', icon: CheckCircle2, adminOnly: true },
    ],
  },
  {
    key: 'conversion',
    label: '招生转化',
    icon: HeartHandshake,
    items: [
      { view: 'activities', label: '招生活动', icon: CalendarRange, section: '活动发布', adminOnly: true },
      { view: 'activitySignups', label: '报名处理', icon: ClipboardCheck, section: '报名转化', adminOnly: true },
      { view: 'guidedOps', label: '报名转班流程', icon: HeartHandshake, section: '报名转化', adminOnly: true },
    ],
  },
  {
    key: 'classes',
    label: '班级与课包',
    icon: BookOpen,
    items: [
      { view: 'projectScenes', label: '班级工作台', icon: BookOpen, section: '日常管理', adminOnly: true },
      { view: 'learningPrograms', label: '班级与课包', icon: SquareStack, section: '班级资料', adminOnly: true },
      { view: 'students', label: '学员档案', icon: GraduationCap, section: '人员资料' },
      { view: 'teachers', label: '教师档案', icon: Users, adminOnly: true, section: '人员资料' },
    ],
  },
  {
    key: 'lessons',
    label: '排课与上课',
    icon: CalendarRange,
    items: [
      { view: 'lessonScenes', label: '课堂工作台', icon: CalendarRange, section: '今日上课' },
      { view: 'learningSessions', label: '课堂/场次', icon: CalendarRange, section: '课表维护', adminOnly: true },
    ],
  },
  {
    key: 'content',
    label: '内容与小程序',
    icon: Megaphone,
    items: [
      { view: 'operationSlots', label: '小程序投放位', icon: Megaphone, section: '小程序展示', adminOnly: true },
      { view: 'audioMaterials', label: '音频素材', icon: Radio, section: '素材库' },
      { view: 'videoMaterials', label: '视频素材', icon: Video, section: '素材库' },
    ],
  },
  {
    key: 'reports',
    label: '测评与报告',
    icon: ClipboardList,
    items: [
      { view: 'assessmentWorkspace', label: '填写测评', icon: MicVocal, section: '填写与查看' },
      { view: 'reports', label: '已生成报告', icon: FileText, section: '填写与查看' },
      { view: 'sharePreview', label: '小程序预览', icon: Share2, section: '填写与查看' },
      { view: 'assessmentTemplates', label: '评估表模板', icon: BadgeCheck, adminOnly: true, section: '模板配置' },
      { view: 'reportTemplates', label: '报告模板', icon: BadgeCheck, adminOnly: true, section: '模板配置' },
      { view: 'reportEvents', label: '报告任务', icon: ClipboardList, section: '任务与归档', adminOnly: true },
      { view: 'reportInstances', label: '报告结果', icon: FileText, section: '任务与归档', adminOnly: true },
    ],
  },
  {
    key: 'dataCenter',
    label: '数据中心',
    icon: Archive,
    items: [
      { view: 'programStudents', label: '班级学员关系', icon: GraduationCap, adminOnly: true, section: '关系维护' },
      { view: 'programTeachers', label: '班级老师关系', icon: Users, adminOnly: true, section: '关系维护' },
      { view: 'sessionStudents', label: '课堂学员出勤', icon: ClipboardCheck, adminOnly: true, section: '关系维护' },
      { view: 'sessionTeachers', label: '课堂老师关系', icon: Users, adminOnly: true, section: '关系维护' },
      { view: 'auditLogs', label: '审计日志', icon: Archive, adminOnly: true, section: '诊断记录' },
    ],
  },
  {
    key: 'settings',
    label: '系统设置',
    icon: Settings,
    items: [
      { view: 'systemSettings', label: '系统设置', icon: Settings, adminOnly: true },
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
    title: '招生活动',
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
    title: '班级与课包',
    description: '管理一对一、体验课、小组课、长期课包和活动营。后续排课、出勤、报告都会从这里关联。',
    icon: SquareStack,
    createLabel: '新建班级/课包',
    columns: [
      { key: 'title', label: '名称' },
      { key: 'type', label: '类型', render: (record, resources) => displayResourceField('learningPrograms', 'type', record.type, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('learningPrograms', 'status', record.status, resources) },
      { key: 'plannedSessionCount', label: '计划课堂', render: (record) => String(record.plannedSessionCount ?? '-') },
    ],
  },
  learningSessions: {
    title: '课堂/场次',
    description: '记录真实发生的一堂课、一次补课、一次活动场次或一次体验课。',
    icon: CalendarRange,
    createLabel: '新建课堂',
    columns: [
      { key: 'title', label: '课堂' },
      { key: 'theme', label: '主题' },
      { key: 'programId', label: '所属班级', render: (record, resources) => displayResourceField('learningSessions', 'programId', record.programId, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('learningSessions', 'status', record.status, resources) },
    ],
  },
  programStudents: {
    title: '班级学员关系',
    description: '排查班级里的学员记录。日常添加学员请从班级工作台进入，这里只用于修正异常关系。',
    icon: GraduationCap,
    createLabel: '添加学员',
    columns: [
      { key: 'programId', label: '班级/课包', render: (record, resources) => displayResourceField('programStudents', 'programId', record.programId, resources) },
      { key: 'studentId', label: '学员', render: (record, resources) => displayResourceField('programStudents', 'studentId', record.studentId, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('programStudents', 'status', record.status, resources) },
    ],
  },
  programTeachers: {
    title: '班级老师关系',
    description: '排查班级里的教师分工。日常分配老师请从班级工作台进入，这里只用于修正异常关系。',
    icon: Users,
    createLabel: '添加教师',
    columns: [
      { key: 'programId', label: '班级/课包', render: (record, resources) => displayResourceField('programTeachers', 'programId', record.programId, resources) },
      { key: 'teacherId', label: '教师', render: (record, resources) => displayResourceField('programTeachers', 'teacherId', record.teacherId, resources) },
      { key: 'role', label: '角色', render: (record, resources) => displayResourceField('programTeachers', 'role', record.role, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('programTeachers', 'status', record.status, resources) },
    ],
  },
  sessionStudents: {
    title: '课堂学员出勤',
    description: '排查每堂课的学员出勤。日常点名请从课堂工作台进入，这里只用于补救或核对。',
    icon: ClipboardCheck,
    createLabel: '添加课堂学员',
    columns: [
      { key: 'sessionId', label: '课堂', render: (record, resources) => displayResourceField('sessionStudents', 'sessionId', record.sessionId, resources) },
      { key: 'studentId', label: '学员', render: (record, resources) => displayResourceField('sessionStudents', 'studentId', record.studentId, resources) },
      { key: 'status', label: '出勤', render: (record, resources) => displayResourceField('sessionStudents', 'status', record.status, resources) },
    ],
  },
  sessionTeachers: {
    title: '课堂老师关系',
    description: '排查每堂课实际参与的老师。日常确认老师请从课堂工作台进入，这里只用于补救或核对。',
    icon: Users,
    createLabel: '添加课堂教师',
    columns: [
      { key: 'sessionId', label: '课堂', render: (record, resources) => displayResourceField('sessionTeachers', 'sessionId', record.sessionId, resources) },
      { key: 'teacherId', label: '教师', render: (record, resources) => displayResourceField('sessionTeachers', 'teacherId', record.teacherId, resources) },
      { key: 'role', label: '角色', render: (record, resources) => displayResourceField('sessionTeachers', 'role', record.role, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('sessionTeachers', 'status', record.status, resources) },
    ],
  },
  reportTemplates: {
    title: '报告模板',
    description: '维护学生评估、教师反馈、课堂报告和班级总结等报告种类。',
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
    title: '报告任务',
    description: '按班级、课堂、活动或自定义范围发起测评、反馈和阶段总结任务。',
    icon: ClipboardList,
    createLabel: '新建报告任务',
    columns: [
      { key: 'title', label: '任务' },
      { key: 'reportType', label: '类型', render: (record, resources) => displayResourceField('reportEvents', 'reportType', record.reportType, resources) },
      { key: 'scopeType', label: '范围', render: (record, resources) => displayResourceField('reportEvents', 'scopeType', record.scopeType, resources) },
      { key: 'status', label: '状态', render: (record, resources) => displayResourceField('reportEvents', 'status', record.status, resources) },
    ],
  },
  reportInstances: {
    title: '报告结果',
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
