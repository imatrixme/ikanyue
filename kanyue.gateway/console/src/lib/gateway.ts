// Release, state and policy endpoints of /gateway/v1. Drafts are edited as
// PocketBase records; only these calls change what an environment serves.

import { request } from './api'

export const stages = ['TEST', 'PRE', 'RELEASE'] as const
export type Stage = (typeof stages)[number]

export const stageLabels: Record<Stage, string> = { TEST: '测试', PRE: '预发', RELEASE: '生产' }

export interface PolicyItem {
  plugin: string
  config?: Record<string, unknown>
  priority?: number
  stages?: Stage[]
  locked?: boolean
  disabled?: boolean
}

export function itemsOf(value: unknown): PolicyItem[] {
  return Array.isArray(value) ? (value as PolicyItem[]) : []
}

export interface Target {
  kind: 'api' | 'group'
  id: string
}

export const targetKey = (target: Target) => `${target.kind}:${target.id}`

export function parseTarget(key: string): Target | null {
  const [kind, id] = key.split(':')
  return (kind === 'api' || kind === 'group') && id ? { kind, id } : null
}

export interface State {
  version: number
  // unreleased: never served; offline; current: the draft is served; changed: the draft differs.
  status: 'unreleased' | 'offline' | 'current' | 'changed' | 'error'
  error?: string
}

// States are keyed by targetKey, then stage.
export type States = Record<string, Partial<Record<Stage, State>>>

export interface ReleaseRequest {
  stage: Stage
  targets: Target[]
  note?: string
  reason?: string
  force?: boolean
}

export interface Change { before?: unknown; after?: unknown }

export interface Released extends Target {
  name: string
  version: number
  previous: number
  offline?: boolean
  diff?: Record<string, Change>
}

export interface ReleaseResult {
  stage: Stage
  version: number
  released: Released[] | null
  unchanged?: Target[] | null
}

export interface Preview extends Target {
  name?: string
  version?: number
  served: unknown
  draft?: unknown
  diff?: Record<string, Change> | null
  preDiff?: Record<string, Change> | null
  error?: string
}

export interface Effective {
  plugin: string
  config?: unknown
  priority?: number
  layer: string
  source: string
  locked?: boolean
}

export interface EffectiveView {
  stage: Stage
  layers: { kind: string; source: string; items: PolicyItem[] | null }[] | null
  draft: Effective[] | null
  error?: string
  served: { policies?: Effective[] | null } | null
  version: number
}

export interface Impacted { api: string; id: string; group: string; stage: Stage; error?: string }

// A release to RELEASE waits for a second identity when the gateway runs with GATEWAY_RELEASE_APPROVAL=1.
export interface Approval {
  id: string
  created: string
  stage: Stage
  request: ReleaseRequest
  changes: Released[] | null
  requester: string
  approver: string
  status: 'pending' | 'approved' | 'rejected' | 'stale' | 'expired'
  decided: string
  stageVersion: number
  error: string
}

export interface StageDiff extends Target {
  name: string
  fromVersion: number
  toVersion: number
  diff?: Record<string, Change> | null
}

export interface MintedToken { token: string; record: { id: string; name: string } }

export const gateway = {
  states: () => request<States>('GET', '/gateway/v1/states'),
  preview: (req: ReleaseRequest) => request<Preview[] | null>('POST', '/gateway/v1/preview', req),
  release: (req: ReleaseRequest) => request<ReleaseResult | { approval: Approval }>('POST', '/gateway/v1/release', req),
  approvals: () => request<Approval[]>('GET', '/gateway/v1/approvals'),
  approve: (id: string) => request<ReleaseResult>('POST', `/gateway/v1/approvals/${id}/approve`),
  reject: (id: string) => request<null>('POST', `/gateway/v1/approvals/${id}/reject`),
  compare: (from: Stage, to: Stage) => request<StageDiff[]>('GET', `/gateway/v1/compare?from=${from}&to=${to}`),
  mintToken: (body: { name: string; role: string; stages: Stage[]; expires: string; note: string }) =>
    request<MintedToken>('POST', '/gateway/v1/tokens', body),
  offline: (req: ReleaseRequest) => request<ReleaseResult>('POST', '/gateway/v1/offline', req),
  rollback: (req: ReleaseRequest & { version: number }) => request<ReleaseResult>('POST', '/gateway/v1/rollback', req),
  effective: (api: string, stage: Stage) => request<EffectiveView>('GET', `/gateway/v1/apis/${api}/effective?stage=${stage}`),
  impact: (collection: string, id: string, fields: Record<string, unknown>) =>
    request<Impacted[] | null>('POST', '/gateway/v1/impact', { collection, id, fields }),
}

export const layerLabels: Record<string, string> = {
  baseline: '平台基线',
  group: '分组策略组',
  api: 'API 策略组',
  override: 'API 覆盖',
  consumer: '应用',
  auth: '鉴权',
}

// apiName names an API after its operation, as the gateway does.
export function apiName(method: string, path: string): string {
  const text = `${method || 'any'} ${path.replace(/[{}]|\.\.\./g, '')}`.toLowerCase()
  const name = text.replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '').slice(0, 100).replace(/[-._]+$/, '')
  return name || 'api'
}
