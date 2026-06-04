import type { GuidedAnswers, GuidedWorkflow, GuidedWorkflowId } from './guidedWorkflows'

export interface GuidedWorkflowDraft {
  answers: GuidedAnswers
  id: string
  stepIndex: number
  title: string
  updatedAt: string
  workflowId: GuidedWorkflowId
  workflowTitle: string
}

const storageKey = 'kanyue.guidedWorkflowDrafts.v1'

export function loadGuidedWorkflowDrafts(): GuidedWorkflowDraft[] {
  if (typeof localStorage === 'undefined') {
    return []
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]') as GuidedWorkflowDraft[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function persistGuidedWorkflowDraft(draft: GuidedWorkflowDraft): GuidedWorkflowDraft[] {
  const drafts = loadGuidedWorkflowDrafts().filter((item) => item.id !== draft.id)
  const next = [draft, ...drafts].slice(0, 30)
  localStorage.setItem(storageKey, JSON.stringify(next))
  return next
}

export function removeGuidedWorkflowDraft(id: string): GuidedWorkflowDraft[] {
  const next = loadGuidedWorkflowDrafts().filter((draft) => draft.id !== id)
  localStorage.setItem(storageKey, JSON.stringify(next))
  return next
}

export function createGuidedWorkflowDraft(workflow: GuidedWorkflow, answers: GuidedAnswers, stepIndex: number, existingId?: string): GuidedWorkflowDraft {
  const answerTitle = answers.title
  const title = typeof answerTitle === 'string' && answerTitle.trim() ? answerTitle.trim() : workflow.title
  return {
    answers: serializableAnswers(answers),
    id: existingId || createDraftId(),
    stepIndex,
    title,
    updatedAt: new Date().toISOString(),
    workflowId: workflow.id,
    workflowTitle: workflow.title,
  }
}

function serializableAnswers(answers: GuidedAnswers): GuidedAnswers {
  return Object.fromEntries(Object.entries(answers).map(([key, value]) => {
    if (typeof File !== 'undefined' && value instanceof File) {
      return [key, value.name]
    }
    return [key, value]
  })) as GuidedAnswers
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `draft_${Date.now()}`
}
