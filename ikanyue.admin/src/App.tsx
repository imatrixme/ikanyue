import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { ShieldAlert } from 'lucide-react'

import { createOpsApi, type OpsApi } from './app/api'
import { appReducer, canAccessView, initialState } from './app/state'
import type { AppView, LoginResult, RewardItemInput } from './app/types'
import { ForcePasswordChangeView } from './components/ops/ForcePasswordChangeView'
import { LoginView } from './components/ops/LoginView'
import { PointsWorkspace } from './components/ops/PointsWorkspace'
import { RewardItemsPanel } from './components/ops/RewardItemsPanel'
import { Shell } from './components/ops/Shell'
import { Panel } from './components/ui/Card'

interface AppProps {
  api?: OpsApi
}

const SESSION_STORAGE_KEY = 'kanyue.points-lite.session'

export default function App({ api: injectedApi }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const api = useMemo(() => injectedApi || createOpsApi(), [injectedApi])

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

  const loadStudentSummary = useCallback(async (studentId: string) => {
    if (!state.token || !studentId) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      dispatch({ type: 'studentSummary:set', payload: await api.getStudentPoints(state.token, studentId) })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '加载积分流水失败') } })
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
    if (!state.profile.isAdmin) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: '积分兑换后台仅允许管理员访问' } })
      return
    }
    void Promise.all([loadStudents(), loadRewards()])
  }, [loadRewards, loadStudents, state.profile, state.token])

  function onLogin(result: LoginResult) {
    writeCachedSession(result)
    dispatch({ type: 'login:success', payload: result })
  }

  function onLogout() {
    clearCachedSession()
    dispatch({ type: 'logout' })
  }

  function setView(view: AppView) {
    if (!canAccessView(state.profile, view)) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: '当前账号没有访问权限' } })
      return
    }
    dispatch({ type: 'view:set', payload: view })
  }

  async function selectStudent(studentId: string) {
    dispatch({ type: 'student:select', payload: studentId })
    await loadStudentSummary(studentId)
  }

  async function addPoints(payload: { amount: number; reason?: string; remark?: string }) {
    dispatch({ type: 'loading:set', payload: true })
    try {
      const summary = await api.addPoints(state.token, { ...payload, studentId: state.selectedStudentId })
      dispatch({ type: 'studentSummary:set', payload: summary })
      await loadStudents()
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '积分已增加' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '增加积分失败') } })
    }
  }

  async function redeem(itemId: string, remark?: string) {
    dispatch({ type: 'loading:set', payload: true })
    try {
      const summary = await api.offlineRedeem(state.token, { itemId, remark, studentId: state.selectedStudentId })
      dispatch({ type: 'studentSummary:set', payload: summary })
      await loadStudents()
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '已扣除积分，确认线下领取' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '兑换失败') } })
    }
  }

  async function saveReward(id: string | null, payload: RewardItemInput) {
    dispatch({ type: 'loading:set', payload: true })
    try {
      if (id) {
        await api.updateReward(state.token, id, payload)
      } else {
        await api.createReward(state.token, payload)
      }
      await loadRewards()
      dispatch({ type: 'toast:set', payload: { type: 'info', message: id ? '实物已更新' : '实物已创建' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: errorMessage(error, '保存实物失败') } })
    }
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

  if (!state.profile.isAdmin) {
    return (
      <Shell
        activeView="points"
        profile={state.profile}
        toast={state.toast}
        onViewChange={setView}
        onLogout={onLogout}
      >
        <Panel className="mx-auto max-w-xl p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--danger-soft)] text-[var(--destructive)]">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold">需要管理员权限</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            积分加分和线下兑换会修改学员积分流水，当前账号没有访问权限。
          </p>
        </Panel>
      </Shell>
    )
  }

  return (
    <Shell
      activeView={state.activeView}
      profile={state.profile}
      toast={state.toast}
      onViewChange={setView}
      onLogout={onLogout}
    >
      {state.activeView === 'points' ? (
        <PointsWorkspace
          loading={state.loading}
          rewards={state.rewards?.items || []}
          selectedStudentId={state.selectedStudentId}
          studentSummary={state.selectedStudentSummary}
          students={state.students?.items || []}
          onAddPoints={addPoints}
          onRedeem={redeem}
          onSearchStudents={loadStudents}
          onSelectStudent={selectStudent}
        />
      ) : null}
      {state.activeView === 'rewards' ? (
        <RewardItemsPanel
          loading={state.loading}
          rewards={state.rewards?.items || []}
          onSave={saveReward}
        />
      ) : null}
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
