import { useCallback, useEffect, useMemo, useReducer } from 'react'

import { createOpsApi, type OpsApi } from './app/api'
import type { AssessmentAnswers } from './app/assessment'
import { executeGuidedPlan, type GuidedPlan } from './app/guidedWorkflows'
import { navItems } from './app/resourceConfig'
import { defaultResourcePayload } from './app/resourceDefaults'
import { getResourceDependencies, nextPublishStatus } from './app/resourceForms'
import type { RelationActionPayload } from './app/sceneWorkspaces'
import { appReducer, canAccessView, initialState } from './app/state'
import type { AppView, LoginResult, OpsResource, ResourceRecord } from './app/types'
import { AssessmentWorkspace } from './components/ops/AssessmentWorkspace'
import { DashboardView } from './components/ops/DashboardView'
import { ForcePasswordChangeView } from './components/ops/ForcePasswordChangeView'
import { GuidedOpsWorkspace } from './components/ops/GuidedOpsWorkspace'
import { LessonSceneWorkspace } from './components/ops/LessonSceneWorkspace'
import { LoginView } from './components/ops/LoginView'
import { ProjectSceneWorkspace } from './components/ops/ProjectSceneWorkspace'
import { ReportsView } from './components/ops/ReportsView'
import { ResourceView } from './components/ops/ResourceView'
import { SharePreviewView } from './components/ops/SharePreviewView'
import { Shell } from './components/ops/Shell'
import { SystemSettingsView } from './components/ops/SystemSettingsView'
import { TemplatesView } from './components/ops/TemplatesView'

interface AppProps {
  api?: OpsApi
}

const SESSION_STORAGE_KEY = 'kanyue.ops.session'

const resourceViews = navItems
  .map((item) => item.view)
  .filter((view): view is OpsResource => !['dashboard', 'guidedOps', 'projectScenes', 'lessonScenes', 'assessmentTemplates', 'assessmentWorkspace', 'reports', 'sharePreview', 'systemSettings'].includes(view))

const sceneResources: OpsResource[] = ['students', 'teachers', 'learningPrograms', 'learningSessions', 'programStudents', 'programTeachers', 'sessionStudents', 'sessionTeachers']
const dashboardResources: OpsResource[] = ['students', 'teachers', 'activitySignups', 'learningPrograms', 'learningSessions', 'programStudents', 'programTeachers', 'sessionStudents', 'sessionTeachers']

export default function App({ api: injectedApi }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const api = useMemo(() => injectedApi || createOpsApi(), [injectedApi])

  useEffect(() => {
    const cached = readCachedSession()
    if (cached) {
      dispatch({ type: 'login:success', payload: cached })
    }
  }, [])

  const loadResourceWithDependencies = useCallback(async (resource: OpsResource) => {
    const dependencies = getResourceDependencies(resource)
    const [result, ...dependencyResults] = await Promise.all([
      api.listResource(resource, state.token),
      ...dependencies.map((dependency) => api.listResource(dependency, state.token, { perPage: 100 })),
    ])
    dispatch({ type: 'resource:set', resource, payload: result })
    dependencyResults.forEach((payload, index) => {
      dispatch({ type: 'resource:set', resource: dependencies[index], payload })
    })
  }, [api, state.token])

  const loadActiveView = useCallback(async (view: AppView) => {
    if (!state.token || state.profile?.passwordChangeRequired) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      if (view === 'dashboard') {
        const [dashboard] = await Promise.all([
          api.dashboard(state.token),
          ...dashboardResources.map((resource) => loadResourceWithDependencies(resource)),
          api.listReports(state.token).then((payload) => dispatch({ type: 'reports:set', payload })),
        ])
        dispatch({ type: 'dashboard:set', payload: dashboard })
      } else if (view === 'guidedOps') {
        await Promise.all(['students', 'teachers', 'activitySignups', 'learningPrograms', 'learningSessions', 'reportTemplates'].map((resource) => loadResourceWithDependencies(resource as OpsResource)))
      } else if (view === 'projectScenes' || view === 'lessonScenes') {
        await Promise.all(sceneResources.map((resource) => loadResourceWithDependencies(resource)))
      } else if (resourceViews.includes(view as OpsResource)) {
        await loadResourceWithDependencies(view as OpsResource)
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
  }, [api, loadResourceWithDependencies, state.profile?.passwordChangeRequired, state.token])

  useEffect(() => {
    if (!state.profile || !state.token || state.profile.passwordChangeRequired) {
      return
    }
    loadActiveView(state.activeView)
  }, [loadActiveView, state.activeView, state.profile, state.token])

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

  async function saveResource(resource: OpsResource, record: ResourceRecord | null, payload: Record<string, unknown>) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      if (record?.id) {
        await api.updateResource(resource, record.id, state.token, payload)
      } else {
        await api.createResource(resource, state.token, { ...defaultResourcePayload(resource), ...payload })
      }
      await loadResourceWithDependencies(resource)
      dispatch({ type: 'toast:set', payload: { type: 'info', message: record?.id ? '已保存记录' : '已创建记录' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '保存失败' } })
    }
  }

  async function createSceneRelations(action: RelationActionPayload) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      await Promise.all(action.payloads.map((payload) => {
        const existing = findExistingRelationRecord(action.resource, state.resources[action.resource]?.items || [], payload)
        return existing?.id
          ? api.updateResource(action.resource, existing.id, state.token, payload)
          : api.createResource(action.resource, state.token, { ...defaultResourcePayload(action.resource), ...payload })
      }))
      await Promise.all(sceneResources.map((resource) => loadResourceWithDependencies(resource)))
      dispatch({ type: 'toast:set', payload: { type: 'info', message: `已保存 ${action.payloads.length} 条场景关系` } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '保存场景关系失败' } })
    }
  }

  async function submitGuidedPlan(plan: GuidedPlan) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      const results = await executeGuidedPlan(api, state.token, plan)
      await Promise.all([...new Set(results.map((result) => result.operation.resource))].map((resource) => loadResourceWithDependencies(resource)))
      dispatch({ type: 'toast:set', payload: { type: 'info', message: `已创建 ${results.length} 个相关记录` } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '流程创建失败' } })
    }
  }

  const uploadRichTextImage = useCallback(async (file: File) => {
    if (!state.token) {
      throw new Error('登录状态已失效，请重新登录')
    }
    const result = await api.uploadRichTextImage(state.token, file)
    return result.url
  }, [api, state.token])

  async function publishResource(resource: OpsResource, record: ResourceRecord) {
    if (!state.token) {
      return
    }
    const status = nextPublishStatus(resource, record.status)
    if (!status) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      await api.updateResource(resource, record.id, state.token, { status })
      await loadResourceWithDependencies(resource)
      dispatch({ type: 'toast:set', payload: { type: 'info', message: status === 'draft' ? '已转为草稿' : '已发布' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '发布失败' } })
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

  async function submitAssessment(answers: AssessmentAnswers, options: { templateId?: string; studentId?: string } = {}) {
    if (!state.token) {
      return
    }
    const template = state.templates?.items.find((item) => item.id === options.templateId)
      || state.templates?.items.find((item) => item.status === 'published')
      || state.templates?.items[0]
    const studentId = options.studentId || String(state.resources.students?.items[0]?.id || '')
    if (!template || !studentId) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: '缺少可用模板或学员' } })
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      const draft = await api.createAssessment(state.token, { templateId: template.id, studentId, answersJson: answers })
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

  async function openReportDetail(reportId: string) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      dispatch({ type: 'reportDetail:set', payload: await api.getReport(state.token, reportId) })
      dispatch({ type: 'shareLink:set', payload: null })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '加载报告失败' } })
    }
  }

  async function createReportShare(reportId: string) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      const share = await api.createShareLink(state.token, reportId)
      dispatch({ type: 'shareLink:set', payload: share })
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '分享链接已创建' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '创建分享失败' } })
    }
  }

  async function revokeReportShare(shareId: string) {
    if (!state.token) {
      return
    }
    dispatch({ type: 'loading:set', payload: true })
    try {
      dispatch({ type: 'shareLink:set', payload: await api.revokeShareLink(state.token, shareId) })
      dispatch({ type: 'toast:set', payload: { type: 'info', message: '分享链接已撤销' } })
    } catch (error) {
      dispatch({ type: 'toast:set', payload: { type: 'error', message: error instanceof Error ? error.message : '撤销分享失败' } })
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

  return (
    <Shell
      activeView={state.activeView}
      profile={state.profile}
      toast={state.toast}
      onViewChange={setView}
      onLogout={onLogout}
    >
      {state.activeView === 'dashboard' ? (
        <DashboardView
          data={state.dashboard}
          profile={state.profile}
          resources={state.resources}
          reports={state.reports}
          onViewChange={setView}
        />
      ) : null}
      {state.activeView === 'guidedOps' ? (
        <GuidedOpsWorkspace
          resources={state.resources}
          submitting={state.loading}
          onSubmitPlan={submitGuidedPlan}
          onUploadRichTextImage={uploadRichTextImage}
        />
      ) : null}
      {state.activeView === 'projectScenes' ? (
        <ProjectSceneWorkspace
          resources={state.resources}
          loading={state.loading}
          onCreateRelations={createSceneRelations}
        />
      ) : null}
      {state.activeView === 'lessonScenes' ? (
        <LessonSceneWorkspace
          resources={state.resources}
          loading={state.loading}
          onCreateRelations={createSceneRelations}
        />
      ) : null}
      {resourceViews.includes(state.activeView as OpsResource) ? (
        <ResourceView
          resource={state.activeView as OpsResource}
          result={state.resources[state.activeView as OpsResource]}
          onSearch={(keyword) => searchResource(state.activeView as OpsResource, keyword)}
          onSave={(record, payload) => saveResource(state.activeView as OpsResource, record, payload)}
          onPublish={(record) => publishResource(state.activeView as OpsResource, record)}
          loading={state.loading}
          resources={state.resources}
          onUploadRichTextImage={uploadRichTextImage}
        />
      ) : null}
      {state.activeView === 'assessmentTemplates' ? <TemplatesView data={state.templates} onCreate={createTemplate} onPublish={publishTemplate} /> : null}
      {state.activeView === 'assessmentWorkspace' ? (
        <AssessmentWorkspace
          templates={state.templates?.items || []}
          students={state.resources.students?.items || []}
          onSubmit={submitAssessment}
          submitting={state.loading}
        />
      ) : null}
      {state.activeView === 'reports' ? (
        <ReportsView
          data={state.reports}
          detail={state.reportDetail}
          shareLink={state.activeShareLink}
          onOpenDetail={openReportDetail}
          onCreateShare={createReportShare}
          onRevokeShare={revokeReportShare}
          onPreviewShare={previewShare}
        />
      ) : null}
      {state.activeView === 'sharePreview' ? <SharePreviewView preview={state.sharePreview} /> : null}
      {state.activeView === 'systemSettings' ? <SystemSettingsView profile={state.profile} /> : null}
    </Shell>
  )
}

function readCachedSession(): LoginResult | null {
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
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(result))
}

function clearCachedSession() {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

function findExistingRelationRecord(resource: OpsResource, records: ResourceRecord[], payload: Record<string, unknown>) {
  return records.find((record) => {
    if (resource === 'programStudents') {
      return record.programId === payload.programId && record.studentId === payload.studentId
    }
    if (resource === 'programTeachers') {
      return record.programId === payload.programId && record.teacherId === payload.teacherId
    }
    if (resource === 'sessionStudents') {
      return record.sessionId === payload.sessionId && record.studentId === payload.studentId
    }
    if (resource === 'sessionTeachers') {
      return record.sessionId === payload.sessionId && record.teacherId === payload.teacherId
    }
    return false
  })
}
