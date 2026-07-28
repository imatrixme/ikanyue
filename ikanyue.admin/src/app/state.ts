import type { AppAction, AppState, AppView, OpsProfile } from './types'

export const initialState: AppState = {
  profile: null,
  token: '',
  activeView: 'dashboard',
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
        activeView: 'dashboard',
        loading: false,
        profile: action.payload.profile,
        token: action.payload.token,
      }
    case 'logout':
      return initialState
    case 'view:set':
      return { ...state, activeView: action.payload }
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
  if (!profile || profile.blocked) return false
  if (profile.isAdmin) return true
  const capabilities = new Set(profile.courseCreditCapabilities || [])
  if (view === 'dashboard') return capabilities.size > 0
  if (view === 'students') return capabilities.has('course_credit.academic') || capabilities.has('course_credit.teacher')
  if (view === 'classes') return capabilities.has('course_credit.academic')
  if (view === 'lessons') return capabilities.has('course_credit.academic') || capabilities.has('course_credit.teacher') || capabilities.has('course_credit.settlement')
  if (view === 'appointments') return capabilities.has('course_credit.academic')
  if (view === 'teachers') return capabilities.has('course_credit.teacher')
  if (view === 'exceptions') return capabilities.has('course_credit.settlement') || capabilities.has('course_credit.audit')
  if (view === 'audit') return capabilities.has('course_credit.audit')
  if (['courses', 'packages', 'enrollments', 'accounts'].includes(view)) return capabilities.has('course_credit.finance')
  return false
}
