import type { GuidedStep, GuidedWorkflow } from './guidedWorkflowTypes'
import { choiceField, datetimeField, fileField, multiselectField, numberField, pendingField, relationField, step, textareaField, textField, workflow } from './guidedWorkflowBuilders'

const signupActivitySteps: GuidedStep[] = [
  step('purpose', '活动目的', '这次活动为什么发生？', '先确认对外展示的活动本身。', [
    textField('title', '活动标题', '如：周末声乐体验营', true),
    choiceField('activityType', '活动类型', [['open-class', '公开课'], ['trial', '体验课'], ['camp', '训练营'], ['custom', '自定义']]),
    textareaField('description', '活动简介'),
  ]),
  step('participants', '报名对象', '谁可以报名？', '决定这是公开收集报名，还是只给已有学员。', [
    choiceField('audience', '报名对象', [['new_students', '新学员'], ['existing_students', '已有学员'], ['all', '全部用户']]),
    numberField('capacity', '名额'),
    choiceField('signupMode', '报名方式', [['free', '自由报名'], ['review', '报名后审核'], ['invite', '邀请报名']]),
  ]),
  step('time', '时间', '什么时候发生？', '不确定也要显式标记待定。', [
    datetimeField('startTime', '开始时间'),
    datetimeField('endTime', '结束时间'),
    pendingField('timePending', '时间待定'),
  ]),
  step('place', '地点', '在哪里发生？', '地点可以是校区、教室、线上会议或待定。', [
    textField('location', '地点', '如：静安校区 A 教室'),
    pendingField('placePending', '地点待定'),
  ]),
  step('people', '人物', '谁负责和授课？', '负责人、老师可以先待分配，但必须被看见。', [
    multiselectField('teacherIds', '负责老师', 'teachers'),
    textField('ownerName', '运营负责人', '如：林老师'),
    pendingField('peoplePending', '负责人/老师待分配'),
  ]),
  step('rules', '报名与分班', '报名后怎么处理？', '决定报名池、分班和后续课堂的生成方式。', [
    choiceField('classRule', '分班规则', [['pending_pool', '进入待分班池'], ['auto_by_capacity', '按人数自动分班'], ['manual_review', '审核后人工分班']]),
    choiceField('sessionRule', '活动场次', [['single', '一次性活动'], ['series', '多场次活动'], ['pending', '先不排场次']]),
    pendingField('reportAfterActivity', '活动后发起测评报告'),
  ]),
  step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存活动、报名入口和必要的教学关系。', []),
]

const trialLessonSteps: GuidedStep[] = [
  step('purpose', '体验目的', '这是一节什么体验课？', '体验课可以是一对一，也可以是多人。', [
    textField('title', '体验课名称', '如：张同学一对一体验课', true),
    choiceField('classSize', '体验形式', [['one_on_one', '一对一'], ['group', '多人体验']]),
    textField('theme', '体验主题', '如：音准诊断'),
  ]),
  step('participants', '体验学员', '哪些学员参加？', '可选择已有学员；新报名学员可以后续从报名池补齐。', [
    multiselectField('studentIds', '学员', 'students'),
    pendingField('studentsPending', '学员待补齐'),
  ]),
  step('time', '时间', '体验课什么时候上？', '可先创建待排课。', [
    datetimeField('startTime', '开始时间'),
    datetimeField('endTime', '结束时间'),
    pendingField('timePending', '时间待排'),
  ]),
  step('place', '地点', '体验课在哪里上？', '沿用校区或标记为线上/待定。', [
    textField('location', '地点'),
    pendingField('placePending', '地点待定'),
  ]),
  step('people', '老师', '谁来上这节体验课？', '老师可先待分配。', [
    multiselectField('teacherIds', '老师', 'teachers'),
    textField('ownerName', '跟进负责人'),
    pendingField('peoplePending', '老师待分配'),
  ]),
  step('rules', '后续规则', '体验后怎么跟进？', '体验课后通常进入报告或转长期课。', [
    pendingField('reportAfterActivity', '课后生成体验报告'),
    choiceField('classRule', '体验后处理', [['pending_pool', '进入跟进池'], ['manual_review', '人工决定是否转班'], ['auto_by_capacity', '直接形成体验班']]),
  ]),
  step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存体验班级、课堂和参与关系。', []),
]

const longTermClassSteps: GuidedStep[] = [
  step('purpose', '开班目的', '要开一个什么班？', '一对一也是一个班，只是班里只有一个学生。', [
    textField('title', '班级/课程名称', '如：暑期一对一声乐课', true),
    choiceField('classSize', '班型', [['one_on_one', '一对一'], ['group', '小组课'], ['large_class', '班课']]),
    textField('theme', '课程主题'),
  ]),
  step('participants', '班级学员', '哪些学生进入这个班？', '可以先选一部分，后续从报名池继续加入。', [
    multiselectField('studentIds', '学员', 'students'),
    pendingField('studentsPending', '学员待补齐'),
  ]),
  step('time', '周期', '这期课怎么安排时间？', '长期班可以先只填计划开始和课堂数。', [
    datetimeField('startTime', '计划开始'),
    numberField('sessionCount', '计划课堂'),
    pendingField('timePending', '具体课表待排'),
  ]),
  step('place', '默认地点', '这个班通常在哪里上课？', '课堂可以覆盖默认地点。', [
    textField('location', '默认地点'),
    pendingField('placePending', '地点待定'),
  ]),
  step('people', '班级老师', '谁负责这个班？', '主教、助教和负责人都属于人物事实。', [
    multiselectField('teacherIds', '老师', 'teachers'),
    textField('ownerName', '班级负责人'),
    pendingField('peoplePending', '老师待分配'),
  ]),
  step('rules', '排课规则', '要不要现在生成课堂？', '可以只创建班级，也可以先生成第一堂课。', [
    choiceField('sessionRule', '排课方式', [['pending', '先不排课'], ['single', '先生成第一堂课'], ['series', '后续批量排课']]),
    pendingField('reportAfterActivity', '阶段后发起测评报告'),
  ]),
  step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存长期班级、学员/老师关系和可选课堂。', []),
]

const addLessonSteps = lessonLikeSteps('加课目的', '要给哪个班级加一堂课？', '临时加课、补课、活动课都可以走这里。', '课堂标题', '课后动作')
const attendanceSteps = lessonLikeSteps('记录目的', '要记录哪堂课的出勤？', '出勤是实际发生事实，不改变长期班成员关系。', '出勤记录标题', '后续处理')
const makeupLessonSteps = lessonLikeSteps('补课目的', '为什么要安排补课？', '补课可以来自缺席、老师调整或教学节奏变化。', '补课标题', '补课规则')

const reportLaunchSteps = reportSteps('报告目的', '要发起哪类报告？', '报告可以基于活动、班级或单堂课。', '报告任务标题')
const closePeriodSteps = reportSteps('阶段目的', '要结束哪一期或哪阶段？', '阶段收口会生成总评或复盘报告任务。', '阶段总结标题')

const materialSteps: GuidedStep[] = [
  step('purpose', '素材目的', '这份素材解决什么问题？', '先确认素材标题、类型和使用场景。', [
    textField('title', '素材标题', '如：气息稳定练习', true),
    choiceField('materialType', '素材类型', [['exercise', '练习'], ['demo', '示范'], ['lesson', '课程'], ['replay', '回放']]),
    textareaField('description', '素材简介'),
  ]),
  step('participants', '适用对象', '谁适合使用？', '素材可以面向新学员、已有班级或特定阶段。', [
    choiceField('audience', '适用人群', [['new_students', '新学员'], ['existing_students', '已有学员'], ['all', '全部用户']]),
    choiceField('difficulty', '难度', [['L1', 'L1 入门'], ['L2', 'L2 基础'], ['L3', 'L3 进阶'], ['L4', 'L4 高阶']]),
  ]),
  step('time', '上架时间', '什么时候上架？', '可立即发布，也可以先准备草稿。', [
    datetimeField('startTime', '计划上架'),
    pendingField('timePending', '上架时间待定'),
  ]),
  step('place', '展示位置', '在哪里展示？', '素材可进入首页、课程卡片或素材库。', [
    choiceField('placement', '展示位置', [['course-card', '课程卡片'], ['home-banner', '首页横幅'], ['activity-list', '活动列表']]),
    pendingField('placePending', '展示位置待定'),
  ]),
  step('people', '作者', '谁负责这份素材？', '作者和负责人会进入素材记录。', [
    textField('author', '作者'),
    textField('ownerName', '运营负责人'),
    pendingField('peoplePending', '作者待确认'),
  ]),
  step('rules', '发布规则', '素材要如何发布？', '决定是否发布以及是否创建投放位。', [
    fileField('coverImage', '封面图片', 'image/*'),
    fileField('materialFile', '素材文件'),
    choiceField('publishStatus', '发布状态', [['draft', '草稿'], ['published', '发布']]),
    pendingField('createSlot', '同步创建运营位'),
  ]),
  step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存素材记录和可选运营位。', []),
]

const promoteContentSteps: GuidedStep[] = [
  step('purpose', '投放目的', '要把什么推到小程序？', '投放位可以指向活动、音频、视频或报告入口。', [
    textField('title', '投放标题', '如：首页暑期体验课', true),
    choiceField('targetType', '目标类型', [['activity', '活动'], ['audio', '音频'], ['video', '视频'], ['assessment_report', '测评报告'], ['webview', '网页']]),
  ]),
  step('participants', '面向用户', '谁会看到？', '第一版通过文案记录人群，后续可接入更细分规则。', [
    choiceField('audience', '目标人群', [['new_students', '新学员'], ['existing_students', '已有学员'], ['all', '全部用户']]),
    textField('targetUrl', '目标 URL'),
  ]),
  step('time', '展示时间', '什么时候开始展示？', '可以配置投放周期。', [
    datetimeField('startTime', '开始展示'),
    datetimeField('endTime', '结束展示'),
    pendingField('timePending', '展示时间待定'),
  ]),
  step('place', '展示位置', '放在小程序哪里？', '位置决定用户从哪里进入。', [
    choiceField('placement', '展示位置', [['home-banner', '首页横幅'], ['course-card', '课程卡片'], ['activity-list', '活动列表'], ['report-entry', '报告入口']]),
    pendingField('placePending', '位置待定'),
  ]),
  step('people', '运营负责人', '谁负责这次投放？', '负责人用于排查和复盘。', [
    textField('ownerName', '负责人'),
    pendingField('peoplePending', '负责人待定'),
  ]),
  step('rules', '排序状态', '投放如何生效？', '决定排序、启停和素材图。', [
    numberField('sortOrder', '排序'),
    choiceField('publishStatus', '状态', [['draft', '草稿'], ['active', '启用'], ['inactive', '停用']]),
  ]),
  step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存一个小程序运营位。', []),
]

const reviewSignupSteps: GuidedStep[] = [
  step('purpose', '报名目的', '要处理哪类报名？', '用于登记线下报名或人工补录。', [
    textField('title', '报名批次', '如：周末体验课报名', true),
    textField('realName', '报名姓名', '如：张同学'),
  ]),
  step('participants', '报名人', '这个报名人是谁？', '可关联已有学员，也可先保留为报名记录。', [
    multiselectField('studentIds', '关联学员', 'students'),
    numberField('age', '年龄'),
  ]),
  step('time', '报名时间', '什么时候报名或到场？', '报名和到场都可以形成运营事实。', [
    datetimeField('startTime', '报名时间'),
    pendingField('timePending', '时间待确认'),
  ]),
  step('place', '报名来源', '从哪里来的报名？', '来源可写校区、活动现场或线上渠道。', [
    textField('location', '来源/地点'),
    pendingField('placePending', '来源待确认'),
  ]),
  step('people', '跟进人', '谁负责跟进？', '跟进人用于后续转化。', [
    textField('ownerName', '跟进人'),
    pendingField('peoplePending', '跟进人待分配'),
  ]),
  step('rules', '审核结果', '这条报名怎么处理？', '决定报名状态和后续备注。', [
    choiceField('signupStatus', '报名状态', [['registered', '已报名'], ['attended', '已到场'], ['cancelled', '已取消'], ['no_show', '未到场']]),
    textareaField('remark', '备注'),
  ]),
  step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存一条活动报名记录。', []),
]

const convertSignupSteps: GuidedStep[] = [
  step('purpose', '转化目的', '要把报名转成什么学习安排？', '报名后可直接形成体验班或长期班。', [
    textField('title', '转化班级名称', '如：张同学体验后长期课', true),
    choiceField('programType', '安排类型', [['trial', '体验课'], ['course_package', '课程包'], ['activity', '活动课']]),
    textField('theme', '学习主题'),
  ]),
  step('participants', '转化学员', '哪些报名人进入安排？', '选择已有学员；新报名人可后续补齐档案。', [
    multiselectField('studentIds', '学员', 'students'),
    pendingField('studentsPending', '学员档案待补齐'),
  ]),
  step('time', '开始时间', '什么时候开始？', '可以先创建班级，课表后排。', [
    datetimeField('startTime', '计划开始'),
    numberField('sessionCount', '计划课堂'),
    pendingField('timePending', '课表待排'),
  ]),
  step('place', '默认地点', '默认在哪里上课？', '后续课堂可覆盖。', [
    textField('location', '默认地点'),
    pendingField('placePending', '地点待定'),
  ]),
  step('people', '负责老师', '谁负责转化后的学习安排？', '可设置主教和助教。', [
    multiselectField('teacherIds', '老师', 'teachers'),
    textField('ownerName', '跟进负责人'),
    pendingField('peoplePending', '老师待分配'),
  ]),
  step('rules', '生成规则', '是否立即生成第一堂课？', '可只形成班级，也可直接进入课堂中心。', [
    choiceField('sessionRule', '排课方式', [['pending', '先不排课'], ['single', '生成第一堂课']]),
    pendingField('reportAfterActivity', '转化后发起测评'),
  ]),
  step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存班级/课包、参与关系和可选课堂。', []),
]

export const guidedWorkflows: GuidedWorkflow[] = [
  workflow('signupActivity', '发布可报名活动', '我要发布一个可报名活动', '活动、报名、分班和后续场次从一个流程里生成。', 'activity', signupActivitySteps, {
    title: '周末声乐体验营',
    activityType: 'trial',
    audience: 'new_students',
    capacity: 12,
    signupMode: 'free',
    classRule: 'pending_pool',
    sessionRule: 'single',
    reportAfterActivity: false,
    location: '待定',
  }, '活动中心、报名中心、课堂中心和报告中心都会看到这次活动的不同侧面。'),
  workflow('reviewSignup', '补录/审核报名', '我要处理一条报名', '线下报名、人工补录、到场确认都从这里进入报名中心。', 'conversion', reviewSignupSteps, {
    title: '报名处理',
    realName: '新报名',
    age: 0,
    signupStatus: 'registered',
    location: '待确认',
  }, '报名会出现在报名中心、活动详情和后续转化队列。'),
  workflow('convertSignupToClass', '报名转班', '我要把报名转成学习安排', '把报名池中的学员转成体验班、课程包或活动课。', 'conversion', convertSignupSteps, {
    title: '报名转化班级',
    programType: 'trial',
    theme: '体验后跟进',
    sessionCount: 1,
    sessionRule: 'single',
    reportAfterActivity: false,
    location: '待定',
  }, '转化结果会出现在班级中心、课堂中心、学员中心和老师中心。'),
  workflow('trialLesson', '安排体验课', '我要安排一次体验课', '从学员、时间、地点和老师出发，自动形成体验班级和课堂。', 'teaching', trialLessonSteps, {
    title: '一对一体验课',
    classSize: 'one_on_one',
    theme: '声乐基础诊断',
    classRule: 'manual_review',
    reportAfterActivity: false,
    location: '待定',
  }, '体验课会出现在班级中心、课堂中心、学员画像和报告中心。'),
  workflow('longTermClass', '开长期班', '我要开一个长期班', '一对一和多人班都会先形成一个班级，再承载课堂和报告。', 'teaching', longTermClassSteps, {
    title: '长期声乐课',
    classSize: 'one_on_one',
    theme: '阶段提升',
    sessionCount: 8,
    sessionRule: 'pending',
    reportAfterActivity: false,
    location: '待定',
  }, '长期班会出现在班级中心、课表、学员和老师视角。'),
  workflow('addLesson', '给班级加课', '我要给已有安排加一堂课', '把一堂实际发生的课连同学生、老师、时间和地点一起确认。', 'teaching', addLessonSteps, {
    title: '新课堂',
    lessonType: 'regular',
    attendanceRequired: true,
    location: '待定',
  }, '课堂会出现在课堂中心、班级详情、老师日程和学员学习记录。'),
  workflow('scheduleMakeupLesson', '安排补课', '我要安排一次补课', '补课从缺席或调整出发，生成独立课次和参与关系。', 'teaching', makeupLessonSteps, {
    title: '补课安排',
    lessonType: 'makeup',
    attendanceRequired: true,
    location: '待定',
  }, '补课会出现在补课队列、课堂中心、学员学习记录和老师日程。'),
  workflow('attendance', '记录出勤', '我要记录一堂课的实际出勤', '把实际到课、老师、时间、地点和后续动作作为事实记录。', 'attendance', attendanceSteps, {
    title: '课堂出勤',
    attendanceRequired: true,
    location: '待核对',
  }, '出勤会出现在课堂中心、班级中心、学员画像和后续补课/报告队列。'),
  workflow('reportLaunch', '发起测评报告', '我要发起一次测评或反馈报告', '从范围、对象、评估人和发布规则出发生成报告任务。', 'report', reportLaunchSteps, {
    title: '课后反馈报告',
    reportType: 'student_assessment',
    scopeType: 'session',
    reportStatus: 'open',
    location: '线上',
  }, '报告会出现在测评报告中心，并回流到学员、老师、班级和活动视角。'),
  workflow('closeCoursePeriod', '阶段总结', '我要结束一期并发起总评', '期中、期末和自定义阶段总结都从报告任务进入。', 'report', closePeriodSteps, {
    title: '阶段总结',
    reportType: 'program_summary',
    scopeType: 'program',
    reportStatus: 'open',
    autoPublish: false,
    location: '线上',
  }, '阶段总结会回流到班级、学员、老师和报告中心。'),
  workflow('publishAudioMaterial', '发布音频素材', '我要发布一条音频练习', '音频素材和可选投放位从一个流程中创建。', 'content', materialSteps, {
    title: '新音频练习',
    materialKind: 'audio',
    materialType: 'exercise',
    difficulty: 'L1',
    publishStatus: 'draft',
    placement: 'course-card',
    createSlot: false,
  }, '音频会出现在素材库、课程卡片和运营位。'),
  workflow('publishVideoMaterial', '发布视频素材', '我要发布一条视频内容', '视频素材和可选投放位从一个流程中创建。', 'content', materialSteps, {
    title: '新视频课程',
    materialKind: 'video',
    materialType: 'lesson',
    difficulty: 'L1',
    publishStatus: 'draft',
    placement: 'course-card',
    createSlot: false,
  }, '视频会出现在素材库、课程卡片和运营位。'),
  workflow('promoteContent', '配置运营位', '我要配置一个小程序投放位', '首页横幅、课程卡片、报告入口等运营位单独创建。', 'content', promoteContentSteps, {
    title: '首页投放',
    targetType: 'activity',
    audience: 'all',
    placement: 'home-banner',
    sortOrder: 100,
    publishStatus: 'active',
  }, '运营位会出现在小程序入口、活动中心、素材中心和高级数据维护。'),
]

function lessonLikeSteps(purposeTitle: string, purposeQuestion: string, purposeDescription: string, titleLabel: string, rulesTitle: string): GuidedStep[] {
  return [
    step('purpose', purposeTitle, purposeQuestion, purposeDescription, [
      textField('title', titleLabel, '如：暑期第一课', true),
      relationField('programId', '所属班级/课包', 'learningPrograms'),
      textField('theme', '本堂主题'),
      choiceField('lessonType', '课堂类型', [['regular', '常规课'], ['makeup', '补课'], ['activity', '活动课']]),
    ]),
    step('participants', '上课学员', '这堂课谁参加？', '默认可以从班级学员中选择，本次也可以不同。', [
      multiselectField('studentIds', '本次学员', 'students'),
      pendingField('studentsPending', '学员待确认'),
    ]),
    step('time', '上课时间', '这堂课什么时候发生？', '不确定时进入待排课。', [
      datetimeField('startTime', '开始时间'),
      datetimeField('endTime', '结束时间'),
      pendingField('timePending', '时间待排'),
    ]),
    step('place', '上课地点', '这堂课在哪里上？', '可沿用班级默认地点或单独设置。', [
      textField('location', '地点'),
      pendingField('placePending', '地点待定'),
    ]),
    step('people', '上课老师', '谁来上这堂课？', '可以临时换老师或添加助教。', [
      multiselectField('teacherIds', '老师', 'teachers'),
      textField('ownerName', '课堂负责人'),
      pendingField('peoplePending', '老师待分配'),
    ]),
    step('rules', rulesTitle, '课后要记录什么？', '出勤和报告任务可以一并准备。', [
      pendingField('attendanceRequired', '需要记录出勤'),
      pendingField('reportAfterActivity', '课后发起报告'),
    ]),
    step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存课堂、课堂学员和课堂老师关系。', []),
  ]
}

function reportSteps(purposeTitle: string, purposeQuestion: string, purposeDescription: string, titleLabel: string): GuidedStep[] {
  return [
    step('purpose', purposeTitle, purposeQuestion, purposeDescription, [
      textField('title', titleLabel, '如：体验课课后反馈', true),
      choiceField('reportType', '报告类型', [['student_assessment', '学生测评'], ['midterm_student', '期中反馈'], ['final_student', '期末反馈'], ['teacher_feedback', '教师反馈'], ['session_summary', '课堂总结'], ['program_summary', '班级总评']]),
    ]),
    step('participants', '报告对象', '报告描述谁？', '可以是学生、老师、班级或课堂。', [
      choiceField('scopeType', '报告范围', [['program', '班级/课包'], ['session', '课堂'], ['activity', '活动'], ['custom', '自定义']]),
      multiselectField('templateIds', '报告模板', 'reportTemplates'),
      multiselectField('studentIds', '学生接收人', 'students'),
    ]),
    step('time', '时间', '什么时候开始填写或发布？', '报告也需要时间锚点。', [
      datetimeField('startTime', '发起时间'),
      pendingField('timePending', '发布时间待定'),
    ]),
    step('place', '场景地点', '这份报告关联哪里？', '纯线上报告可填写线上或无地点。', [
      textField('location', '关联地点'),
      pendingField('placePending', '地点不适用/待定'),
    ]),
    step('people', '评估人', '谁来填写或负责？', '评估老师和负责人必须明确或待分配。', [
      multiselectField('teacherIds', '评估老师', 'teachers'),
      textField('ownerName', '报告负责人'),
      pendingField('peoplePending', '评估人待分配'),
    ]),
    step('rules', '发布规则', '报告如何生成？', '决定是草稿、收集中还是自动发布。', [
      choiceField('reportStatus', '报告状态', [['draft', '草稿'], ['open', '收集中'], ['published', '发布']]),
      pendingField('autoPublish', '完成后自动发布'),
    ]),
    step('confirmation', '保存前检查', '这次会保存哪些内容？', '确认后会保存报告任务和后续报告结果。', []),
  ]
}
