import { useCallback, useEffect, useMemo, useReducer } from 'react'

import { createOpsApi, type OpsApi } from './app/api'
import type { AssessmentAnswers } from './app/assessment'
import { defaultResourcePayload } from './app/resourceDefaults'
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
  const api = useMemo(() => injectedApi || createOpsApi(), [injectedApi])

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
        dispatch({ type: 'templates:set', payload: await api.listTemplates(state.token) })
        dispatch({ type: 'resource:set', resource: 'students', payload: await api.listResource('students', state.token) })
      } else if (view === 'reports') {
        dispatch({ type: 'reports:set', payload: await api.listReports(state.token) })
      }
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '加载失败' } })
    }
  }, [api, state.token])

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

  async function createResource(resource: OpsResource) {
    if (!state.token) {
      return
    }
    const payload = defaultResourcePayload(resource)
    dispatch({ type: 'loading:set', payload: true })
    try {
      await api.createResource(resource, state.token, payload)
      dispatch({ type: 'resource:set', resource, payload: await api.listResource(resource, state.token) })
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '已创建记录' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '创建失败' } })
    }
  }

  async function createTemplate() {
    if (!state.token) {
      return
    }
    const base = state.templates?.items[0]
    if (!base) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: '没有可复制的模板' } })
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      await api.createTemplate(state.token, {
        name: `${base.name} 副本`,
        version: base.version + 1,
        status: 'draft',
        schemaJson: base.schemaJson,
        scoringJson: base.scoringJson,
        reportJson: base.reportJson,
      })
      dispatch({ type: 'templates:set', payload: await api.listTemplates(state.token) })
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '已创建模板草稿' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '创建模板失败' } })
    }
  }

  async function publishTemplate(templateId: string) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      await api.publishTemplate(state.token, templateId)
      dispatch({ type: 'templates:set', payload: await api.listTemplates(state.token) })
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '模板已发布' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '发布失败' } })
    }
  }

  async function submitAssessment(answers: AssessmentAnswers) {
    if (!state.token) {
      return
    }
    const template = state.templates?.items.find((item) => item.status === 'published') || state.templates?.items[0]
    const student = state.resources.students?.items[0]
    if (!template || !student?.id) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: '缺少可用模板或学员' } })
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      const draft = await api.createAssessment(state.token, { templateId: template.id, studentId: String(student.id), answersJson: answers })
      await api.saveAssessment(state.token, draft.id, { answersJson: answers })
      await api.submitAssessment(state.token, draft.id, { answersJson: answers })
      dispatch({ type: 'reports:set', payload: await api.listReports(state.token) })
      dispatch({ type: 'view:set', payload: 'reports' })
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '评估报告已生成' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '提交评估失败' } })
    }
  }

  async function previewShare(reportId: string) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      const share = await api.createShareLink(state.token, reportId)
      dispatch({ type: 'share:set', payload: await api.viewShare(share.token) })
      dispatch({ type: 'view:set', payload: 'sharePreview' })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '创建分享失败' } })
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
          onCreate={() => createResource(state.activeView as OpsResource)}
          loading={state.loading}
        />
      ) : null}
      {state.activeView === 'assessmentTemplates' ? <TemplatesView data={state.templates} onCreate={createTemplate} onPublish={publishTemplate} /> : null}
      {state.activeView === 'assessmentWorkspace' ? (
        <AssessmentWorkspace template={state.templates?.items[0] || null} onSubmit={submitAssessment} submitting={state.loading} />
      ) : null}
      {state.activeView === 'reports' ? <ReportsView data={state.reports} onPreviewShare={previewShare} /> : null}
      {state.activeView === 'sharePreview' ? <SharePreviewView preview={state.sharePreview} /> : null}
    </Shell>
  )
}
