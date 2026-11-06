import type { LogicalAgent, NextStep, Run } from '../types';

export function compareStepsByPosition(a: NextStep, b: NextStep): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}

export function orderedSteps(steps: readonly NextStep[]): NextStep[] {
  return [...steps].sort(compareStepsByPosition);
}

export function openSteps(steps: readonly NextStep[]): NextStep[] {
  return orderedSteps(steps).filter(step => !step.done);
}

export function completedSteps(steps: readonly NextStep[]): NextStep[] {
  return orderedSteps(steps).filter(step => step.done);
}

export function sourceAgentName(sourceRunId: string, runs: readonly Run[], agents: readonly LogicalAgent[]): string | null {
  const run = runs.find(item => item.id === sourceRunId);
  if (!run) return null;
  return agents.find(agent => agent.id === run.agentId)?.name ?? null;
}

export function completionActorLabel(actorId: string | null, account: { id: string; name: string }): string | null {
  if (actorId === null) return null;
  return actorId === account.id ? account.name : actorId;
}

export type StepCompletionCredit =
  | { kind: 'agent'; runId: string; agentName: string | null; note: string; at: string | null }
  | { kind: 'owner'; label: string | null; at: string | null };

/** Agent attribution wins. completionChangedBy is the token owner on an agent close, so it cannot name the actor. */
export function stepCompletionCredit(step: NextStep, account: { id: string; name: string }, runs: readonly Run[], agents: readonly LogicalAgent[]): StepCompletionCredit | null {
  if (!step.done) return null;
  if (step.completedByRunId) {
    return { kind: 'agent', runId: step.completedByRunId, agentName: sourceAgentName(step.completedByRunId, runs, agents), note: step.completionNote ?? '', at: step.completionChangedAt };
  }
  return { kind: 'owner', label: completionActorLabel(step.completionChangedBy, account), at: step.completionChangedAt };
}

/** One less than the revision the caller believes is current, so the write cannot match. */
export function staleRevision(revision: number): number {
  return revision - 1;
}

const DEMO_UPDATE = / \[demo update \d+\]$/;

/** Deterministic stand-in for a source run rewriting its own instruction. */
export function simulatedInstructionRewrite(instruction: string, revision: number): string {
  const base = instruction.replace(DEMO_UPDATE, '').trim() || 'Updated instruction';
  return `${base} [demo update ${revision + 1}]`;
}
