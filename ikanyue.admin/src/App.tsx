import { useCallback, useEffect, useMemo, useReducer } from 'react'

import { createOpsApi, type OpsApi } from './app/api'
import { appReducer, canAccessView, initialState } from './app/state'
import type { AppView, LoginResult, OpsResource } from './app/types'
import { AssessmentWorkspace } from './components/ops/AssessmentWorkspace'
import { DashboardView } from './components/ops/DashboardView'
import { LoginView } from './components/ops/LoginView'
import { ReportsView } from './components/ops/ReportsView'
import { ResourceView } from './components/ops/ResourceView'
import { SharePreviewView } from './components/ops/SharePreviewView'
import { Shell } from './components/ops/Shell'
import { TemplatesView } from './components/ops/TemplatesView'

interface AppProps {
  api?: OpsApi
}

const resourceViews: OpsResource[] = ['students', 'teachers', 'activities', 'audioMaterials', 'videoMaterials', 'operationSlots', 'auditLogs']

export default function App({ api: injectedApi }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const api = useMemo(() => injectedApi || createOpsApi({ mock: true }), [injectedApi])

  const loadActiveView = useCallback(async (view: AppView) => {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      if (view === 'dashboard') {
        dispatch({ type: 'dashboard:set', payload: await api.dashboard(state.token) })
      } else if (resourceViews.includes(view as OpsResource)) {
        dispatch({ type: 'resource:set', resource: view as OpsResource, payload: await api.listResource(view as OpsResource, state.token) })
      } else if (view === 'assessmentTemplates') {
        dispatch({ type: 'templates:set', payload: await api.listTemplates(state.token) })
      } else if (view === 'assessmentWorkspace') {
        dispatch({ type: 'templates:set', payload: state.templates || await api.listTemplates(state.token) })
      } else if (view === 'reports') {
        dispatch({ type: 'reports:set', payload: await api.listReports(state.token) })
      } else if (view === 'sharePreview') {
        dispatch({ type: 'share:set', payload: await api.viewShare('mock-share-token') })
      }
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '加载失败' } })
    }
  }, [api, state.templates, state.token])

  useEffect(() => {
    if (!state.profile || !state.token) {
      return
    }
    loadActiveView(state.activeView)
  }, [loadActiveView, state.activeView, state.profile, state.token])

  function onLogin(result: LoginResult) {
    dispatch({ type: 'login:success', payload: result })
  }

  function setView(view: AppView) {
    if (!canAccessView(state.profile, view)) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: '当前账号没有访问权限' } })
      return
    }
    dispatch({ type: 'view:set', payload: view })
  }

  async function searchResource(resource: OpsResource, keyword: string) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      dispatch({ type: 'resource:set', resource, payload: await api.listResource(resource, state.token, { q: keyword }) })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '筛选失败' } })
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

  return (
    <Shell
      activeView={state.activeView}
      profile={state.profile}
      toast={state.toast}
      onViewChange={setView}
      onLogout={() => dispatch({ type: 'logout' })}
    >
      {state.activeView === 'dashboard' ? <DashboardView data={state.dashboard} /> : null}
      {resourceViews.includes(state.activeView as OpsResource) ? (
        <ResourceView
          resource={state.activeView as OpsResource}
          result={state.resources[state.activeView as OpsResource]}
          onSearch={(keyword) => searchResource(state.activeView as OpsResource, keyword)}
          loading={state.loading}
        />
      ) : null}
      {state.activeView === 'assessmentTemplates' ? <TemplatesView data={state.templates} /> : null}
      {state.activeView === 'assessmentWorkspace' ? <AssessmentWorkspace template={state.templates?.items[0] || null} onSubmit={() => setView('reports')} /> : null}
      {state.activeView === 'reports' ? <ReportsView data={state.reports} onPreviewShare={() => setView('sharePreview')} /> : null}
      {state.activeView === 'sharePreview' ? <SharePreviewView preview={state.sharePreview} /> : null}
    </Shell>
  )
}
