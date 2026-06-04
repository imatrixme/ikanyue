import type { OpsResource } from './types'

export type GuidedWorkflowId =
  | 'signupActivity'
  | 'trialLesson'
  | 'longTermClass'
  | 'addLesson'
  | 'attendance'
  | 'reportLaunch'
  | 'publishAudioMaterial'
  | 'publishVideoMaterial'
  | 'promoteContent'
  | 'reviewSignup'
  | 'convertSignupToClass'
  | 'scheduleMakeupLesson'
  | 'closeCoursePeriod'

export type GuidedStepKey = 'purpose' | 'participants' | 'time' | 'place' | 'people' | 'rules' | 'confirmation'
export type GuidedFieldType = 'text' | 'textarea' | 'choice' | 'relation' | 'multiselect' | 'datetime' | 'number' | 'pendingSwitch' | 'file'

export interface GuidedFieldOption {
  value: string
  label: string
}

export interface GuidedField {
  key: string
  label: string
  type: GuidedFieldType
  placeholder?: string
  options?: GuidedFieldOption[]
  accept?: string
  relation?: OpsResource
  required?: boolean
}

export interface GuidedStep {
  key: GuidedStepKey
  title: string
  question: string
  description: string
  fields: GuidedField[]
}

export interface GuidedWorkflow {
  id: GuidedWorkflowId
  title: string
  intent: string
  description: string
  tone: 'activity' | 'teaching' | 'attendance' | 'report' | 'content' | 'conversion'
  defaultAnswers: GuidedAnswers
  steps: GuidedStep[]
  sceneSummary: string
}

export type GuidedAnswerValue = string | string[] | boolean | number | File
export type GuidedAnswers = Record<string, GuidedAnswerValue>

export interface GuidedOperation {
  key: string
  resource: OpsResource
  label: string
  payload: Record<string, unknown>
  dependsOn?: string[]
}

export interface GuidedPlanFact {
  key: 'time' | 'place' | 'people'
  label: string
  value: string
  pending: boolean
}

export interface GuidedPlan {
  workflowId: GuidedWorkflowId
  title: string
  facts: GuidedPlanFact[]
  operations: GuidedOperation[]
  scenePlacements: string[]
  warnings: string[]
}

export interface GuidedExecutionResult {
  operation: GuidedOperation
  record: { id: string; [key: string]: unknown }
}

export const requiredGuidedStepKeys: GuidedStepKey[] = ['purpose', 'participants', 'time', 'place', 'people', 'rules', 'confirmation']
