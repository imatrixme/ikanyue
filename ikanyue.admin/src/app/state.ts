import type { AppAction, AppState, AppView, OpsProfile } from './types'

export const initialState: AppState = {
  profile: null,
  token: '',
  activeView: 'dashboard',
  loading: false,
  toast: null,
  dashboard: null,
  resources: {},
  templates: null,
  reports: null,
  reportDetail: null,
  activeShareLink: null,
  sharePreview: null,
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'login:start':
      return { ...state, loading: true, toast: null }
    case 'login:success':
      return {
        ...state,
        loading: false,
        profile: action.payload.profile,
        token: action.payload.token,
        activeView: 'dashboard',
      }
    case 'logout':
      return initialState
    case 'view:set':
      return { ...state, activeView: action.payload, toast: null }
    case 'loading:set':
      return { ...state, loading: action.payload }
    case 'toast:set':
      return { ...state, loading: false, toast: action.payload }
    case 'dashboard:set':
      return { ...state, dashboard: action.payload, loading: false }
    case 'resource:set':
      return { ...state, resources: { ...state.resources, [action.resource]: action.payload }, loading: false }
    case 'templates:set':
      return { ...state, templates: action.payload, loading: false }
    case 'reports:set':
      return { ...state, reports: action.payload, loading: false }
    case 'reportDetail:set':
      return { ...state, reportDetail: action.payload, loading: false }
    case 'shareLink:set':
      return { ...state, activeShareLink: action.payload, loading: false }
    case 'share:set':
      return { ...state, sharePreview: action.payload, loading: false }
    default:
      return state
  }
}

export function canAccessView(profile: OpsProfile | null, view: AppView): boolean {
  if (!profile) {
    return false
  }
  return !['teachers', 'assessmentTemplates', 'auditLogs'].includes(view) || profile.isAdmin
}
