import type { OpsApi } from './api'
import type { GuidedExecutionResult, GuidedPlan } from './guidedWorkflowTypes'

export async function executeGuidedPlan(api: OpsApi, token: string, plan: GuidedPlan): Promise<GuidedExecutionResult[]> {
  const created: Record<string, { id: string; [key: string]: unknown }> = {}
  const results: GuidedExecutionResult[] = []
  for (const operation of plan.operations) {
    const payload = resolvePayload(operation.payload, created) as Record<string, unknown>
    const record = await api.createResource(operation.resource, token, payload)
    created[operation.key] = record
    results.push({ operation, record })
  }
  return results
}

export function resolvePayload(value: unknown, created: Record<string, { id: string }>): unknown {
  if (typeof value === 'string') {
    const match = value.match(/^\{\{(.+)\.id\}\}$/)
    return match ? created[match[1]]?.id || '' : value
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolvePayload(item, created))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolvePayload(nested, created)]))
  }
  return value
}
