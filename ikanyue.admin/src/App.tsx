import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

import { createOpsApi, type OpsApi } from './app/api'
import { viewFromPath, viewPaths } from './app/navigation'
import { appReducer, canAccessView, initialState } from './app/state'
import type { AppView, LoginResult, RewardItem, RewardItemInput, StudentInput, UploadProgressHandler } from './app/types'
import { AdminWorkspaceRoutes } from './components/ops/AdminWorkspaceRoutes'
import { ForcePasswordChangeView } from './components/ops/ForcePasswordChangeView'
import { LoginView } from './components/ops/LoginView'
import { Shell } from './components/ops/Shell'

interface AppProps {
  api?: OpsApi
}

const SESSION_STORAGE_KEY = 'kanyue.points-lite.session'

export default function App(props: AppProps) {
  const Router = typeof window === 'undefined' ? MemoryRouter : BrowserRouter
  return <Router><AppContent {...props} /></Router>
}

function AppContent({ api: injectedApi }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const api = useMemo(() => injectedApi || createOpsApi(), [injectedApi])
  const location = useLocation()
  const navigate = useNavigate()
  const activeView = viewFromPath(location.pathname)

  const loadStudents = useCallback(async (query = '') => {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      const payload = await api.listStudents(state.token, query ? { q: query } : undefined)
      dispatch({ type: 'students:set', payload })
      const studentId = state.selectedStudentId || payload.items[0]?.id
      if (studentId) {
        dispatch({ type: 'studentSummary:set', payload: await api.getStudentPoints(state.token, studentId) })
      }
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '加载学员积分失败') } })
    }
  }, [api, state.selectedStudentId, state.token])

  const loadRewards = useCallback(async () => {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      dispatch({ type: 'rewards:set', payload: await api.listRewards(state.token) })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '加载实物列表失败') } })
    }
  }, [api, state.token])

  const loadManagedStudents = useCallback(async () => {
    if (!state.token) return
    dispatch({ type: 'loading:set', payload: true })
    try {
      const payload = state.profile?.isAdmin
        ? await api.listManagedStudents(state.token, { perPage: 100 })
        : await api.listAssignedStudents(state.token, { perPage: 100 })
      dispatch({ type: 'managedStudents:set', payload })
    } catch (error) {
      const message = errorMessage(error, '加载学员管理列表失败')
      dispatch({ type: 'managedStudents:error', payload: message })
      dispatch({ type: 'toast:set', payload: { type: 'error', message } })
    }
  }, [api, state.profile, state.token])

  const loadStudentSummary = useCallback(async (studentId: string) => {
    if (!state.token || !studentId) {
      return null
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      const summary = await api.getStudentPoints(state.token, studentId)
      dispatch({ type: 'studentSummary:set', payload: summary })
      return summary
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '加载积分流水失败') } })
      return null
    }
  }, [api, state.token])

  useEffect(() => {
    const cached = readCachedSession()
    if (cached) {
      dispatch({ type: 'login:success', payload: cached })
    }
  }, [])

  useEffect(() => {
    if (!state.profile || !state.token || state.profile.passwordChangeRequired) {
      return
    }
    if (state.profile.isAdmin) void Promise.all([loadStudents(), loadRewards(), loadManagedStudents()])
    else if (canAccessView(state.profile, 'students')) void loadManagedStudents()
  }, [loadManagedStudents, loadRewards, loadStudents, state.profile, state.token])

  useEffect(() => {
    if (state.profile && state.activeView !== activeView) dispatch({ type: 'view:set', payload: activeView })
  }, [activeView, state.activeView, state.profile])

  function onLogin(result: LoginResult) {
    writeCachedSession(result)
    dispatch({ type: 'login:success', payload: result })
    navigate('/dashboard', { replace: true })
  }

  function onLogout() {
    clearCachedSession()
    dispatch({ type: 'logout' })
    navigate('/', { replace: true })
  }

  function setView(view: AppView) {
    if (!canAccessView(state.profile, view)) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: '当前账号没有访问权限' } })
      return
    }
    navigate(viewPaths[view])
  }

  async function selectStudent(studentId: string) {
    dispatch({ type: 'student:select', payload: studentId })
    return loadStudentSummary(studentId)
  }

  async function addPoints(studentId: string, payload: { amount: number; reason?: string; remark?: string }): Promise<boolean> {
    dispatch({ type: 'loading:set', payload: true })
    try {
      const summary = await api.addPoints(state.token, { ...payload, studentId })
      dispatch({ type: 'studentSummary:set', payload: summary })
      updateStudentBalance(studentId, summary.balance)
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '积分已增加' } })
      return true
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '增加积分失败') } })
      return false
    }
  }

  async function redeem(studentId: string, itemId: string, remark?: string): Promise<boolean> {
    dispatch({ type: 'loading:set', payload: true })
    try {
      const summary = await api.offlineRedeem(state.token, { itemId, remark, studentId })
      dispatch({ type: 'studentSummary:set', payload: summary })
      updateStudentBalance(studentId, summary.balance)
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '已扣除积分，确认线下领取' } })
      return true
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '兑换失败') } })
      return false
    }
  }

  async function saveReward(id: string | null, payload: RewardItemInput): Promise<boolean> {
    dispatch({ type: 'loading:set', payload: true })
    try {
      const saved = id ? await api.updateReward(state.token, id, payload) : await api.createReward(state.token, payload)
      mergeReward(saved, !id)
      dispatch({ type: 'toast:set', payload: { type: 'info', message: id ? '实物已更新' : '实物已创建' } })
      return true
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '保存实物失败') } })
      return false
    }
  }

  async function uploadRewardImage(id: string, file: File, onProgress?: UploadProgressHandler): Promise<RewardItem | null> {
    dispatch({ type: 'loading:set', payload: true })
    try {
      const reward = await api.uploadRewardImage(state.token, id, file, onProgress)
      mergeReward(reward, false)
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '实物图片已上传' } })
      return reward
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '上传实物图片失败') } })
      return null
    }
  }

  async function saveStudent(id: string | null, payload: StudentInput): Promise<boolean> {
    dispatch({ type: 'loading:set', payload: true })
    try {
      if (id) await api.updateStudent(state.token, id, payload)
      else await api.createStudent(state.token, payload)
      await Promise.all([loadManagedStudents(), loadStudents()])
      dispatch({ type: 'toast:set', payload: { type: 'info', message: id ? '学员已更新' : '学员已创建' } })
      return true
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '保存学员失败') } })
      return false
    }
  }

  function updateStudentBalance(studentId: string, balance: number) {
    if (!state.students) return
    dispatch({ type: 'students:set', payload: { ...state.students, items: state.students.items.map((student) => student.id === studentId ? { ...student, balance } : student) } })
  }

  function mergeReward(reward: RewardItem, created: boolean) {
    if (!state.rewards) return
    const items = created ? [reward, ...state.rewards.items] : state.rewards.items.map((item) => item.id === reward.id ? reward : item)
    const perPage = state.rewards.pagination?.perPage || Math.max(1, items.length)
    dispatch({
      type: 'rewards:set',
      payload: {
        items,
        pagination: {
          page: state.rewards.pagination?.page || 1,
          perPage,
          totalItems: items.length,
          totalPages: Math.max(1, Math.ceil(items.length / perPage)),
        },
      },
    })
  }

  if (!state.profile) {
    return (
      <LoginView
        api={api}
        loading={state.loading}
        errorMessage={state.toast?.type === 'error' ? state.toast.message : undefined}
        onSuccess={onLogin}
        onError={(message) => dispatch({ type: 'toast:set', payload: { type: 'error', message } })}
      />
    )
  }

  if (state.profile.passwordChangeRequired) {
    return (
      <ForcePasswordChangeView
        api={api}
        token={state.token}
        profile={state.profile}
        errorMessage={state.toast?.type === 'error' ? state.toast.message : undefined}
        onSuccess={onLogin}
        onError={(message) => dispatch({ type: 'toast:set', payload: { type: 'error', message } })}
      />
    )
  }

  return (
    <Shell
      activeView={activeView}
      profile={state.profile}
      toast={state.toast}
      onViewChange={setView}
      onLogout={onLogout}
    >
      <AdminWorkspaceRoutes api={api} loading={state.loading} managedStudents={state.managedStudents?.items || []} managedStudentsError={state.managedStudentsError} onAddPoints={addPoints} onLoadManagedStudents={loadManagedStudents} onLoadRewards={loadRewards} onLoadStudent={selectStudent} onLoadStudents={() => loadStudents()} onRedeem={redeem} onSaveReward={saveReward} onSaveStudent={saveStudent} onUploadRewardImage={uploadRewardImage} profile={state.profile} rewards={state.rewards?.items || []} selectedStudentId={state.selectedStudentId} studentSummary={state.selectedStudentSummary} students={state.students?.items || []} token={state.token} />
    </Shell>
  )
}

function readCachedSession(): LoginResult | null {
  /* v8 ignore next 3 -- SSR import path does not call readCachedSession; browser tests always provide localStorage. */
  if (typeof localStorage === 'undefined') {
    return null
  }
  try {
    const text = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!text) {
      return null
    }
    const parsed = JSON.parse(text) as LoginResult
    return parsed?.token && parsed?.profile ? parsed : null
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

function writeCachedSession(result: LoginResult) {
  /* v8 ignore next 3 -- browser runtime always provides localStorage; guard is for non-DOM embedding. */
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(result))
}

function clearCachedSession() {
  /* v8 ignore next 3 -- browser runtime always provides localStorage; guard is for non-DOM embedding. */
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
