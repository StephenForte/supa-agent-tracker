import { nextStepSummary } from '../derive';
import type { NextStep, Project, ProjectNextSteps, ReportingPolicy } from '../types';

/** PRD v0.6 "Base instruction draft", shown as agent-facing copy. */
export const BASE_INSTRUCTION_DRAFT = 'Before work, read the configured project through MCP, then check in with project ID, task/agent name, title, workload type, and known harness/model. Retain the returned run ID and revision. Report meaningful progress, blockers, review readiness, and PR links. Report tool aggregates only when observed; never infer counts. At completion, failure, or cancellation, check out with an accurate summary and outcome. Create or update concrete follow-up To Dos without duplicating existing tasks. Each subagent reports its own run if it has access; otherwise its parent explicitly reports on its behalf. If reporting fails, continue the user\'s authorized work, retain pending reports where possible, and retry with the same request IDs. Do not include secrets or claim reporting succeeded when it failed.';

export interface AgentFacingContext {
  projectId: string;
  projectName: string;
  reportingPolicy: ReportingPolicy;
  openSteps: NextStep[];
  remainingOpenSteps: number;
  waitingNote: string | null;
}

/** Agent-facing preview built only from a project and its tracker handoff. Completed steps are omitted. */
export function agentFacingContext(project: Project, handoff: ProjectNextSteps): AgentFacingContext {
  const summary = nextStepSummary(handoff.steps);
  const openSteps = handoff.steps
    .filter(step => !step.done)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return {
    projectId: project.id,
    projectName: project.name,
    reportingPolicy: project.reportingPolicy,
    openSteps,
    remainingOpenSteps: summary.remaining,
    waitingNote: handoff.waitingNote?.text ?? null,
  };
}
