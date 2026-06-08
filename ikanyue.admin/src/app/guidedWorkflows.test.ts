import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from './api'
import { createGuidedWorkflowDraft, loadGuidedWorkflowDrafts, persistGuidedWorkflowDraft, removeGuidedWorkflowDraft } from './guidedWorkflowDrafts'
import { mockResources } from './mockData'
import {
  buildGuidedPlan,
  executeGuidedPlan,
  guidedWorkflows,
  initialGuidedAnswers,
  recordLabel,
  relationOptions,
  resolvePayload,
  validateWorkflowSteps,
  workflowById,
} from './guidedWorkflows'

describe('guided ops workflows', () => {
  it('defines every first-phase scenario with the required natural-question steps', () => {
    expect(guidedWorkflows.map((workflow) => workflow.id)).toEqual([
      'signupActivity',
      'reviewSignup',
      'convertSignupToClass',
      'trialLesson',
      'longTermClass',
      'addLesson',
      'scheduleMakeupLesson',
      'attendance',
      'reportLaunch',
      'closeCoursePeriod',
      'publishAudioMaterial',
      'publishVideoMaterial',
      'promoteContent',
    ])

    guidedWorkflows.forEach((workflow) => {
      expect(validateWorkflowSteps(workflow)).toEqual([])
      expect(workflow.steps.map((step) => step.key)).toEqual(['purpose', 'participants', 'time', 'place', 'people', 'rules', 'confirmation'])
      expect(workflow.sceneSummary.length).toBeGreaterThan(8)
    })
  })

  it('builds signup activity plans with activity, signup surface, and teaching operations', () => {
    const workflow = workflowById('signupActivity')
    const plan = buildGuidedPlan(workflow, {
      ...initialGuidedAnswers(workflow),
      title: '端午体验营',
      startTime: '2026-06-20T09:00',
      endTime: '2026-06-20T11:00',
      location: '静安校区',
      teacherIds: ['teacher_1'],
      ownerName: '林老师',
    }, mockResources)

    expect(plan.title).toBe('端午体验营')
    expect(plan.facts.map((fact) => fact.label)).toEqual(['时间', '地点', '人物'])
    expect(plan.facts[2].value).toContain('王老师')
    expect(plan.operations.map((operation) => operation.resource)).toEqual(expect.arrayContaining(['activities', 'operationSlots', 'learningPrograms', 'learningSessions']))
    expect(plan.operations.map((operation) => operation.resource)).not.toContain('reportEvents')
    expect(plan.operations.find((operation) => operation.key === 'slot')?.payload).toMatchObject({ targetId: '{{activity.id}}' })
    expect(plan.scenePlacements).toContain('报名中心')
  })

  it('builds teaching, attendance, and report plans from scenario defaults', () => {
    const trialPlan = buildGuidedPlan(workflowById('trialLesson'), {
      ...workflowById('trialLesson').defaultAnswers,
      studentIds: ['student_1', 'student_2'],
      teacherIds: ['teacher_1'],
      sessionRule: 'single',
      timePending: true,
      peoplePending: true,
    }, mockResources)
    expect(trialPlan.operations.map((operation) => operation.resource)).toEqual(expect.arrayContaining(['learningPrograms', 'programStudents', 'programTeachers', 'learningSessions', 'sessionStudents', 'sessionTeachers']))
    expect(trialPlan.facts.find((fact) => fact.key === 'time')?.pending).toBe(true)
    expect(trialPlan.facts.find((fact) => fact.key === 'people')?.pending).toBe(true)

    const longTermPlan = buildGuidedPlan(workflowById('longTermClass'), workflowById('longTermClass').defaultAnswers)
    expect(longTermPlan.operations).toHaveLength(1)
    expect(longTermPlan.operations[0].payload).toMatchObject({ type: 'course_package', plannedSessionCount: 8 })

    const attendancePlan = buildGuidedPlan(workflowById('attendance'), {
      ...workflowById('attendance').defaultAnswers,
      studentIds: ['student_1'],
      teacherIds: ['teacher_1'],
      attendanceRequired: true,
      location: '',
    })
    expect(attendancePlan.warnings).toContain('地点未填写，将按待定处理。')
    expect(attendancePlan.operations.find((operation) => operation.resource === 'sessionStudents')?.payload).toMatchObject({ status: 'present' })

    const reportPlan = buildGuidedPlan(workflowById('reportLaunch'), {
      ...workflowById('reportLaunch').defaultAnswers,
      title: '期中反馈',
      reportStatus: 'draft',
      templateIds: ['report_template_1'],
    })
    expect(reportPlan.operations).toEqual([
      expect.objectContaining({
        resource: 'reportEvents',
        payload: expect.objectContaining({ title: '期中反馈', status: 'draft', scopeType: 'session', templateId: 'report_template_1' }),
      }),
    ])

    const makeupPlan = buildGuidedPlan(workflowById('scheduleMakeupLesson'), {
      ...workflowById('scheduleMakeupLesson').defaultAnswers,
      studentIds: ['student_1'],
      teacherIds: ['teacher_1', 'teacher_2'],
    })
    expect(makeupPlan.operations.map((operation) => operation.resource)).toEqual(expect.arrayContaining(['learningSessions', 'sessionStudents', 'sessionTeachers']))
  })

  it('exposes semantic relation options and throws for unknown workflow ids', () => {
    expect(relationOptions('students', mockResources).map((option) => option.label)).toContain('张同学')
    expect(relationOptions('teachers', mockResources).map((option) => option.label)).toContain('王老师')
    expect(relationOptions('students', {})).toEqual([])
    expect(recordLabel('teachers', { id: 'teacher_fallback', cellphone: '13800138009' })).toBe('13800138009')
    expect(recordLabel('activities', { id: 'activity_named', name: '命名活动' })).toBe('命名活动')
    expect(() => workflowById('missing' as never)).toThrow('Unknown workflow')
  })

  it('covers pending, fallback, and optional generated-plan branches', () => {
    const pendingSignup = buildGuidedPlan(workflowById('signupActivity'), {
      activityType: '',
      capacity: 0,
      sessionRule: 'pending',
      reportAfterActivity: true,
    })
    expect(pendingSignup.title).toBe('发布可报名活动')
    expect(pendingSignup.operations.map((operation) => operation.resource)).toEqual(['activities', 'operationSlots', 'reportEvents'])
    expect(pendingSignup.operations[0].payload).toMatchObject({ type: 'trial', location: '待定', maxParticipants: undefined })
    expect(pendingSignup.warnings).toEqual(expect.arrayContaining([
      '时间未填写，将按待定处理。',
      '地点未填写，将按待定处理。',
      '老师或负责人未选择，将按待分配处理。',
    ]))

    const classPlan = buildGuidedPlan(workflowById('longTermClass'), {
      ...workflowById('longTermClass').defaultAnswers,
      title: '',
      studentIds: ['student_1', ''],
      teacherIds: ['teacher_1', 'teacher_2'],
      sessionRule: 'single',
      reportAfterActivity: true,
      startTime: '2026-09-01T10:00',
      endTime: '2026-09-01T11:00',
      location: '浦东校区',
    }, mockResources)
    expect(classPlan.title).toBe('开长期班')
    expect(classPlan.facts.find((fact) => fact.key === 'time')?.value).toBe('2026-09-01T10:00 至 2026-09-01T11:00')
    expect(classPlan.operations.find((operation) => operation.key === 'programTeacher1')?.payload).toMatchObject({ role: 'assistant' })
    expect(classPlan.operations.map((operation) => operation.resource)).toEqual(expect.arrayContaining(['learningSessions', 'reportEvents']))

    const addLessonPlan = buildGuidedPlan(workflowById('addLesson'), {
      ...workflowById('addLesson').defaultAnswers,
      programId: 'program_existing',
      studentIds: ['student_1'],
      teacherIds: ['unknown_teacher'],
      reportAfterActivity: true,
      timePending: true,
      placePending: true,
    }, mockResources)
    expect(addLessonPlan.operations[0].payload).toMatchObject({ programId: 'program_existing' })
    expect(addLessonPlan.operations.find((operation) => operation.resource === 'sessionStudents')?.payload).toMatchObject({ status: 'present' })
    expect(addLessonPlan.facts.find((fact) => fact.key === 'people')?.value).toContain('unknown_teacher')

    const reportFallback = buildGuidedPlan(workflowById('reportLaunch'), {
      title: '',
      reportType: '',
      scopeType: '',
      templateId: 'legacy_template',
      reportStatus: '',
      autoPublish: true,
      studentIds: ['student_2'],
      teacherIds: ['teacher_1'],
      placePending: true,
    }, mockResources)
    expect(reportFallback.operations[0].payload).toMatchObject({
      title: '创建报告任务',
      reportType: 'student_assessment',
      templateId: 'legacy_template',
      scopeType: 'custom',
      status: 'open',
      recipientRulesJson: { autoPublish: true },
    })
    expect(reportFallback.facts.find((fact) => fact.key === 'place')?.pending).toBe(true)
  })

  it('builds content, promotion, signup, and conversion workflow plans', () => {
    const cover = new File(['cover'], 'cover.png', { type: 'image/png' })
    const audio = new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' })
    const audioPlan = buildGuidedPlan(workflowById('publishAudioMaterial'), {
      ...workflowById('publishAudioMaterial').defaultAnswers,
      title: '',
      ownerName: '王老师',
      coverImage: cover,
      materialFile: audio,
      createSlot: true,
      publishStatus: '',
    })
    expect(audioPlan.operations.map((operation) => operation.resource)).toEqual(['audioMaterials', 'operationSlots'])
    expect(audioPlan.operations[0].payload).toMatchObject({
      title: '新音频素材',
      author: '王老师',
      coverImage: cover,
      audioSource: audio,
      status: 'draft',
    })
    expect(audioPlan.operations[1].payload).toMatchObject({ targetType: 'audio', targetId: '{{audioMaterial.id}}' })

    const videoPlan = buildGuidedPlan(workflowById('publishVideoMaterial'), {
      ...workflowById('publishVideoMaterial').defaultAnswers,
      title: '',
      materialType: '',
      publishStatus: '',
      difficulty: '',
      materialFile: '/video/demo.mp4',
    })
    expect(videoPlan.operations).toEqual([
      expect.objectContaining({
        resource: 'videoMaterials',
        payload: expect.objectContaining({ title: '新视频素材', type: 'lesson', difficulty: 'L1', resolution: '1080p', videoSource: '/video/demo.mp4' }),
      }),
    ])

    const promoPlan = buildGuidedPlan(workflowById('promoteContent'), {
      ...workflowById('promoteContent').defaultAnswers,
      title: '首页报告入口',
      targetType: 'assessment_report',
      targetUrl: '/pages/report/index',
      sortOrder: 5,
    })
    expect(promoPlan.operations[0]).toMatchObject({
      resource: 'operationSlots',
      payload: { title: '首页报告入口', targetType: 'assessment_report', targetUrl: '/pages/report/index', sortOrder: 5 },
    })

    const signupPlan = buildGuidedPlan(workflowById('reviewSignup'), {
      ...workflowById('reviewSignup').defaultAnswers,
      title: '页面报名',
      realName: '',
      studentIds: [''],
      userId: 'manual_user',
      age: '-1',
      signupStatus: '',
    })
    expect(signupPlan.operations[0]).toMatchObject({
      resource: 'activitySignups',
      payload: { realName: '页面报名', userId: 'manual_user', age: 0, status: 'registered' },
    })

    const conversionPlan = buildGuidedPlan(workflowById('convertSignupToClass'), {
      ...workflowById('convertSignupToClass').defaultAnswers,
      programType: 'activity',
      studentIds: ['student_1'],
      teacherIds: ['teacher_1'],
      sessionRule: 'pending',
    })
    expect(conversionPlan.operations.map((operation) => operation.resource)).toEqual(['learningPrograms', 'programStudents', 'programTeachers'])
    expect(conversionPlan.operations[0].payload).toMatchObject({ type: 'activity' })

    const trialConversion = buildGuidedPlan(workflowById('convertSignupToClass'), {
      ...workflowById('convertSignupToClass').defaultAnswers,
      programType: 'unexpected',
      sessionRule: 'pending',
    })
    expect(trialConversion.operations[0].payload).toMatchObject({ type: 'trial' })
  })

  it('resolves generated-record references and executes plan operations in order', async () => {
    expect(resolvePayload({ targetId: '{{activity.id}}', nested: ['{{activity.id}}'] }, { activity: { id: 'activity_new' } })).toEqual({
      targetId: 'activity_new',
      nested: ['activity_new'],
    })
    expect(resolvePayload('{{missing.id}}', {})).toBe('')
    expect(resolvePayload(1, {})).toBe(1)

    const api = createMockOpsApi()
    const workflow = workflowById('trialLesson')
    const plan = buildGuidedPlan(workflow, {
      ...initialGuidedAnswers(workflow),
      studentIds: ['student_1'],
      teacherIds: ['teacher_1'],
      sessionRule: 'single',
    })
    const results = await executeGuidedPlan(api, 'token', plan)
    const program = results.find((result) => result.operation.key === 'program')?.record
    const session = results.find((result) => result.operation.key === 'session')?.record
    const sessionStudent = results.find((result) => result.operation.resource === 'sessionStudents')?.record

    expect(program?.id).toMatch(/^learningPrograms_/)
    expect(session?.programId).toBe(program?.id)
    expect(sessionStudent?.sessionId).toBe(session?.id)
  })

  it('executes every guided workflow without dangling references or lost core relations', async () => {
    for (const workflow of guidedWorkflows) {
      const api = createMockOpsApi()
      const plan = buildGuidedPlan(workflow, {
        ...initialGuidedAnswers(workflow),
        studentIds: ['student_1'],
        teacherIds: ['teacher_1'],
        templateIds: ['template_1'],
        templateId: 'template_1',
        activityId: 'activity_1',
        userId: 'student_1',
        programId: 'program_1',
        sessionRule: 'single',
        publishStatus: 'active',
        createSlot: true,
      }, mockResources)
      const results = await executeGuidedPlan(api, 'token', plan)
      const records = Object.fromEntries(results.map((result) => [result.operation.key, result.record]))

      expect(results.length).toBe(plan.operations.length)
      expect(JSON.stringify(results.map((result) => result.record))).not.toContain('{{')
      if (records.program && records.session) {
        expect(records.session.programId).toBe(records.program.id)
      }
      results
        .filter((result) => result.operation.resource === 'programStudents')
        .forEach((result) => expect(result.record.programId).toBe(records.program.id))
      results
        .filter((result) => result.operation.resource === 'programTeachers')
        .forEach((result) => expect(result.record.programId).toBe(records.program.id))
      results
        .filter((result) => result.operation.resource === 'sessionStudents')
        .forEach((result) => expect(result.record.sessionId).toBe(records.session.id))
      results
        .filter((result) => result.operation.resource === 'sessionTeachers')
        .forEach((result) => expect(result.record.sessionId).toBe(records.session.id))
      results
        .filter((result) => result.operation.resource === 'operationSlots' && records.activity)
        .forEach((result) => expect(result.record.targetId).toBe(records.activity.id))
    }
  })

  it('keeps guided workflow drafts recoverable when local cache is stale or invalid', () => {
    const storageKey = 'kanyue.guidedWorkflowDrafts.v1'
    localStorage.setItem(storageKey, '{"broken":true}')
    expect(loadGuidedWorkflowDrafts()).toEqual([])

    localStorage.setItem(storageKey, '{broken-json')
    expect(loadGuidedWorkflowDrafts()).toEqual([])

    vi.stubGlobal('localStorage', undefined)
    expect(loadGuidedWorkflowDrafts()).toEqual([])
    vi.unstubAllGlobals()

    const draft = createGuidedWorkflowDraft(workflowById('signupActivity'), {
      title: '  草稿活动  ',
      coverImage: new File(['cover'], 'cover.png', { type: 'image/png' }),
    }, 2, 'draft_fixed')
    expect(draft.title).toBe('草稿活动')
    expect(draft.answers.coverImage).toBe('cover.png')
    expect(persistGuidedWorkflowDraft(draft).map((item) => item.id)).toEqual(['draft_fixed'])
    expect(removeGuidedWorkflowDraft('draft_fixed')).toEqual([])

    vi.stubGlobal('crypto', {})
    expect(createGuidedWorkflowDraft(workflowById('signupActivity'), {}, 0).id).toMatch(/^draft_/)
    vi.unstubAllGlobals()
  })
})
