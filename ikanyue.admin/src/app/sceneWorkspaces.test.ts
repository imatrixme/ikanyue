import { describe, expect, it } from 'vitest'

import { mockResources } from './mockData'
import {
  buildLessonScenes,
  buildProjectScenes,
  buildLessonScene,
  buildProgramStudentPayloads,
  buildProgramTeacherPayloads,
  buildProjectScene,
  buildSessionStudentPayloads,
  buildSessionTeacherPayloads,
  filterPeople,
  lessonLockedContext,
  projectLockedContext,
  selectedPeopleFirst,
} from './sceneWorkspaces'

describe('scene workspace models', () => {
  it('reconstructs project scenes from loaded resource records', () => {
    const scene = buildProjectScene(mockResources, 'program_1')

    expect(scene.project?.title).toBe('春季体验课')
    expect(scene.students.find((person) => person.id === 'student_1')).toMatchObject({
      name: '张同学',
      selected: true,
      relationStatus: '学习中',
    })
    expect(scene.teachers.find((person) => person.id === 'teacher_1')).toMatchObject({
      name: '王老师',
      selected: true,
      role: '主讲',
    })
    expect(scene.sessions.map((session) => session.id)).toEqual(['session_1'])
    expect(projectLockedContext(scene.project)).toMatchObject({
      id: 'program_1',
      title: '春季体验课',
    })
  })

  it('reconstructs lesson scenes with inherited and explicit teachers', () => {
    const scene = buildLessonScene(mockResources, 'session_1')

    expect(scene.lesson?.title).toBe('体验课第一堂')
    expect(scene.project?.id).toBe('program_1')
    expect(scene.students.find((person) => person.id === 'student_2')).toMatchObject({
      selected: true,
      relationStatus: '缺席',
    })
    expect(scene.inheritedTeachers.find((person) => person.id === 'teacher_1')).toMatchObject({
      selected: true,
      role: '主讲',
    })
    expect(scene.teachers.find((person) => person.id === 'teacher_1')).toMatchObject({
      selected: true,
      role: '主讲',
    })
    expect(lessonLockedContext(scene.lesson, scene.project)).toMatchObject({
      id: 'session_1',
      title: '体验课第一堂',
    })
  })

  it('generates context-locked relation payloads without asking for parent context again', () => {
    expect(buildProgramStudentPayloads('program_1', ['student_1', 'student_1', 'student_2'], 'registered')).toEqual({
      resource: 'programStudents',
      payloads: [
        { programId: 'program_1', studentId: 'student_1', status: 'registered' },
        { programId: 'program_1', studentId: 'student_2', status: 'registered' },
      ],
    })
    expect(buildProgramTeacherPayloads('program_1', ['teacher_1'], 'assistant')).toEqual({
      resource: 'programTeachers',
      payloads: [{ programId: 'program_1', teacherId: 'teacher_1', role: 'assistant', status: 'active' }],
    })
    expect(buildSessionStudentPayloads('session_1', ['student_2'], 'present')).toEqual({
      resource: 'sessionStudents',
      payloads: [{ sessionId: 'session_1', studentId: 'student_2', status: 'present' }],
    })
    expect(buildSessionTeacherPayloads('session_1', ['teacher_2'], 'evaluator')).toEqual({
      resource: 'sessionTeachers',
      payloads: [{ sessionId: 'session_1', teacherId: 'teacher_2', role: 'evaluator', status: 'active' }],
    })
  })

  it('promotes selected people and filters by recognizable identity details', () => {
    const scene = buildProjectScene(mockResources, 'program_1')
    const ordered = selectedPeopleFirst(scene.students, ['student_2'])

    expect(ordered.slice(0, 2).map((person) => person.id)).toEqual(['student_1', 'student_2'])
    expect(filterPeople(scene.students, '')).toBe(scene.students)
    expect(filterPeople(scene.students, '13900139003')).toHaveLength(1)
    expect(filterPeople(scene.students, 'Echo')[0].id).toBe('student_3')
  })

  it('handles empty scenes, missing contexts, avatars, and identity fallbacks', () => {
    const resources = {
      learningPrograms: { items: [{ id: 'program_empty', title: '', name: '空项目', status: '', plannedSessionCount: '' }], pagination: { page: 1, perPage: 20, totalItems: 1, totalPages: 1 } },
      learningSessions: { items: [{ id: 'session_empty', programId: 'missing_program', title: '', theme: '', status: '' }], pagination: { page: 1, perPage: 20, totalItems: 1, totalPages: 1 } },
      students: { items: [{ id: 'fallback_student', cellphone: '13900000000', avatar: 'https://kyoss.abcmem.com/a.png' }], pagination: { page: 1, perPage: 20, totalItems: 1, totalPages: 1 } },
      teachers: { items: [{ id: 'fallback_teacher', nickName: '昵称老师' }], pagination: { page: 1, perPage: 20, totalItems: 1, totalPages: 1 } },
    }

    expect(buildProjectScenes(resources).map((scene) => scene.project?.id)).toEqual(['program_empty'])
    expect(buildLessonScenes(resources).map((scene) => scene.lesson?.id)).toEqual(['session_empty'])
    expect(projectLockedContext(null)).toBeNull()
    expect(lessonLockedContext(null, null)).toBeNull()
    expect(projectLockedContext(resources.learningPrograms.items[0])?.subtitle).toBe('- · -')
    expect(lessonLockedContext(resources.learningSessions.items[0], null)?.subtitle).toBe('-')

    const projectScene = buildProjectScene(resources, 'program_empty')
    expect(projectScene.students[0]).toMatchObject({
      name: '13900000000',
      secondary: '13900000000',
      avatar: 'https://kyoss.abcmem.com/a.png',
      status: '可用',
    })
    expect(projectScene.teachers[0]).toMatchObject({
      name: '昵称老师',
      secondary: '昵称老师',
    })

    expect(buildProjectScene(resources, 'missing').project).toBeNull()
    expect(buildLessonScene(resources, 'missing').lesson).toBeNull()
    expect(filterPeople(projectScene.students, 'does-not-exist')).toEqual([])
  })
})
