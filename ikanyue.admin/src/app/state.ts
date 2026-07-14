import type { AppAction, AppState, AppView, OpsProfile } from './types'

export const initialState: AppState = {
  profile: null,
  token: '',
  activeView: 'points',
  loading: false,
  toast: null,
  students: null,
  managedStudents: null,
  managedStudentsError: '',
  rewards: null,
  selectedStudentId: '',
  selectedStudentSummary: null,
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'login:start':
      return { ...state, loading: true, toast: null }
    case 'login:success':
      return {
        ...state,
        activeView: 'points',
        loading: false,
        profile: action.payload.profile,
        token: action.payload.token,
      }
    case 'logout':
      return initialState
    case 'view:set':
      return { ...state, activeView: action.payload, toast: null }
    case 'loading:set':
      return { ...state, loading: action.payload }
    case 'toast:set':
      return { ...state, loading: false, toast: action.payload }
    case 'students:set': {
      const firstStudentId = action.payload.items[0]?.id || ''
      const selectedStudentId = state.selectedStudentId || firstStudentId
      return { ...state, loading: false, students: action.payload, selectedStudentId }
    }
    case 'managedStudents:set':
      return { ...state, loading: false, managedStudents: action.payload, managedStudentsError: '' }
    case 'managedStudents:error':
      return { ...state, loading: false, managedStudentsError: action.payload }
    case 'rewards:set':
      return { ...state, loading: false, rewards: action.payload }
    case 'student:select':
      return { ...state, selectedStudentId: action.payload, selectedStudentSummary: null }
    case 'studentSummary:set':
      return { ...state, loading: false, selectedStudentSummary: action.payload }
    default:
      return state
  }
}

export function canAccessView(profile: OpsProfile | null, view: AppView): boolean {
  return Boolean(profile?.isAdmin && (view === 'students' || view === 'points' || view === 'rewards'))
}
