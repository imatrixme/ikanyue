import type { GuidedAnswers, GuidedField, GuidedStep, GuidedStepKey, GuidedWorkflow, GuidedWorkflowId } from './guidedWorkflowTypes'
import type { OpsResource } from './types'

export function workflow(
  id: GuidedWorkflowId,
  title: string,
  intent: string,
  description: string,
  tone: GuidedWorkflow['tone'],
  steps: GuidedStep[],
  defaultAnswers: GuidedAnswers,
  sceneSummary: string,
): GuidedWorkflow {
  return { id, title, intent, description, tone, steps, defaultAnswers, sceneSummary }
}

export function step(key: GuidedStepKey, title: string, question: string, description: string, fields: GuidedField[]): GuidedStep {
  return { key, title, question, description, fields }
}

export function textField(key: string, label: string, placeholder = '', required = false): GuidedField {
  return { key, label, placeholder, required, type: 'text' }
}

export function textareaField(key: string, label: string): GuidedField {
  return { key, label, type: 'textarea' }
}

export function numberField(key: string, label: string): GuidedField {
  return { key, label, type: 'number' }
}

export function datetimeField(key: string, label: string): GuidedField {
  return { key, label, type: 'datetime' }
}

export function pendingField(key: string, label: string): GuidedField {
  return { key, label, type: 'pendingSwitch' }
}

export function fileField(key: string, label: string, accept?: string): GuidedField {
  return { key, label, accept, type: 'file' }
}

export function choiceField(key: string, label: string, values: Array<[string, string]>): GuidedField {
  return { key, label, type: 'choice', options: values.map(([value, optionLabel]) => ({ value, label: optionLabel })) }
}

export function relationField(key: string, label: string, relation: OpsResource): GuidedField {
  return { key, label, relation, type: 'relation' }
}

export function multiselectField(key: string, label: string, relation: OpsResource): GuidedField {
  return { key, label, type: 'multiselect', relation }
}
