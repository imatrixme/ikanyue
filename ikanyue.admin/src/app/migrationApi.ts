import { request } from './http'
import type { MigrationApplyResult, MigrationInventory, MigrationPlan, MigrationPreview, ShadowExpectation, ShadowResult } from './migrationTypes'

export interface MigrationOpsApi {
  getMigrationInventory(token: string): Promise<MigrationInventory>
  previewMigration(token: string, plan: MigrationPlan): Promise<MigrationPreview>
  applyMigration(token: string, plan: MigrationPlan, previewHash: string): Promise<MigrationApplyResult>
  runCourseCreditShadow(token: string, sessionIds: string[], expectations: ShadowExpectation[]): Promise<ShadowResult>
}

export function createHttpMigrationOpsApi(baseUrl: string): MigrationOpsApi {
  return {
    getMigrationInventory(token) {
      return request(`${baseUrl}/course-credits/migration/inventory`, { token })
    },
    previewMigration(token, plan) {
      return request(`${baseUrl}/course-credits/migration/preview`, { method: 'POST', token, body: { plan } })
    },
    applyMigration(token, plan, previewHash) {
      return request(`${baseUrl}/course-credits/migration/apply`, {
        method: 'POST', token, body: { plan, previewHash },
        headers: { 'Idempotency-Key': migrationKey(previewHash) },
      })
    },
    runCourseCreditShadow(token, sessionIds, expectations) {
      return request(`${baseUrl}/course-credits/shadow/preview`, {
        method: 'POST', token, body: { expectations, sessionIds },
      })
    },
  }
}

export function createMockMigrationOpsApi(): MigrationOpsApi {
  const inventory = emptyMigrationInventory()
  return {
    async getMigrationInventory() { return structuredClone(inventory) },
    async previewMigration(_token, plan) {
      const unmapped = {
        attendance: inventory.attendance.filter((item) => !plan.sessions.some((session) => session.attendanceRecordIds.includes(item.id))).map((item) => item.id),
        programs: inventory.programs.filter((item) => !plan.programs.some((entry) => entry.legacyProgramId === item.id)).map((item) => item.id),
        sessions: inventory.sessions.filter((item) => !plan.sessions.some((entry) => entry.legacySessionId === item.id)).map((item) => item.id),
        studentHours: inventory.studentHours.filter((item) => !plan.studentHours.some((entry) => entry.studentId === item.id)).map((item) => item.id),
        teacherHours: inventory.teacherHours.filter((item) => !plan.teacherHours.some((entry) => entry.teacherId === item.id)).map((item) => item.id),
      }
      return {
        plan: structuredClone(plan), previewHash: 'mock-migration-preview',
        ready: Object.values(unmapped).every((items) => items.length === 0),
        report: { differences: [], mapped: {}, source: inventory.totals, unmapped },
      }
    },
    async applyMigration(_token, plan, previewHash) {
      return {
        counts: { programs: plan.programs.length, sessions: plan.sessions.length, studentMappings: plan.studentHours.length, teacherAdjustments: plan.teacherHours.length },
        differenceCount: 0, operationId: 'mock-migration-operation', previewHash, replayed: false, unexplainedCount: 0,
      }
    },
    async runCourseCreditShadow(_token, sessionIds, expectations) {
      return {
        differenceCount: expectations.length === sessionIds.length ? 0 : sessionIds.length - expectations.length,
        generatedAt: new Date().toISOString(), reports: [], sessionCount: sessionIds.length,
        status: expectations.length === sessionIds.length ? 'passed' : 'failed', writeCount: 0,
      }
    },
  }
}

export function emptyMigrationInventory(): MigrationInventory {
  return {
    availability: {}, attendance: [], programs: [], sessions: [], studentHours: [], teacherHours: [],
    targets: { classes: [], creditTypes: [], packages: [] },
    totals: { attendance: 0, programs: 0, sessions: 0, studentHours: 0, students: 0, teacherHours: 0, teachers: 0 },
  }
}

function migrationKey(previewHash: string) { return `migration:${previewHash}:${Date.now().toString(36)}` }
