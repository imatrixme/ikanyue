import type { OpsApi } from './api'
import { listAllPages } from './courseApi'
import type { ListResult, StudentRecord } from './types'

/** Every student the operator can see, read page by page (bounded by `listAllPages`). */
export function listAllStudents(api: Pick<OpsApi, 'listManagedStudents' | 'listAssignedStudents'>, token: string, scope: 'managed' | 'assigned' = 'managed') {
  const fetch = (query: { page: number; perPage: number }) => scope === 'managed' ? api.listManagedStudents(token, query) : api.listAssignedStudents(token, query)
  return listAllPages<StudentRecord>(async (page, perPage) => toPage(await fetch({ page, perPage })))
}

function toPage<T>(result: ListResult<T>) {
  const { pagination, items } = result
  return {
    items,
    page: pagination?.page ?? 1,
    perPage: pagination?.perPage ?? items.length,
    totalItems: pagination?.totalItems ?? items.length,
    totalPages: pagination?.totalPages ?? 1,
  }
}
