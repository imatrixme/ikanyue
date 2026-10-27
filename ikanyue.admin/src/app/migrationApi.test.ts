import { describe, expect, it, vi } from 'vitest'

import { createHttpMigrationOpsApi, createMockMigrationOpsApi } from './migrationApi'

describe('course credit migration api', () => {
  it('supports a safe zero-source mock preview and apply', async () => {
    const api = createMockMigrationOpsApi()
    const inventory = await api.getMigrationInventory('token')
    const plan = { programs: [], sessions: [], studentHours: [], teacherHours: [] }
    const preview = await api.previewMigration('token', plan)
    const result = await api.applyMigration('token', preview.plan, preview.previewHash)
    const shadow = await api.runCourseCreditShadow('token', ['session'], [{ sessionId: 'session', canSettle: true, students: [], teachers: [] }])

    expect(inventory.totals.sessions).toBe(0)
    expect(preview.ready).toBe(true)
    expect(result.unexplainedCount).toBe(0)
    expect(shadow).toMatchObject({ status: 'passed', writeCount: 0 })
  })

  it('maps inventory, preview, and apply to authenticated Hono routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 10000, data: {} }) })
    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpMigrationOpsApi('/ops')
    const plan = { programs: [], sessions: [], studentHours: [], teacherHours: [] }

    await api.getMigrationInventory('token')
    await api.previewMigration('token', plan)
    await api.applyMigration('token', plan, 'preview-hash')
    await api.runCourseCreditShadow('token', ['session'], [])

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/ops/course-credits/migration/inventory',
      '/ops/course-credits/migration/preview',
      '/ops/course-credits/migration/apply',
      '/ops/course-credits/shadow/preview',
    ])
    const applyOptions = fetchMock.mock.calls[2][1]
    expect(applyOptions.headers.authorization).toBe('Bearer token')
    expect(applyOptions.headers['Idempotency-Key']).toMatch(/^migration:preview-hash:/)
    expect(JSON.parse(applyOptions.body)).toEqual({ plan, previewHash: 'preview-hash' })
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ expectations: [], sessionIds: ['session'] })
  })
})
