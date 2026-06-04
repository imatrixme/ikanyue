import { guidedWorkflows } from './guidedWorkflowCatalog'
import type { GuidedAnswers, GuidedWorkflow, GuidedWorkflowId } from './guidedWorkflowTypes'

export { guidedWorkflows }

export function workflowById(id: GuidedWorkflowId): GuidedWorkflow {
  const workflow = guidedWorkflows.find((item) => item.id === id)
  if (!workflow) {
    throw new Error(`Unknown workflow: ${id}`)
  }
  return workflow
}

export function initialGuidedAnswers(workflow: GuidedWorkflow): GuidedAnswers {
  return { ...workflow.defaultAnswers }
}
