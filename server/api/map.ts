import type { agents, pullRequestRefs, runEvents, runs, toolUsageAggregates } from '../db/schema.js';
import type { ProjectInput as RepoProjectInput, Project as RepoProject } from '../repo/projects.js';
import type { RunPatch, PrInput } from '../repo/runs.js';
import type { CloseRunBody, CreateProjectBody, PatchProjectBody, PatchRunBody } from './schemas.js';

type AgentRow = typeof agents.$inferSelect;
type EventRow = typeof runEvents.$inferSelect;
type PrRow = typeof pullRequestRefs.$inferSelect;
type ToolRow = typeof toolUsageAggregates.$inferSelect;
type RunRow = typeof runs.$inferSelect;

export interface AccountBody {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  publicHandle: string | null;
}

export function toAccount(user: { id: string; displayName: string; email: string; emailVerified: boolean; publicHandle: string | null }): AccountBody {
  return { id: user.id, name: user.displayName, email: user.email, emailVerified: user.emailVerified, publicHandle: user.publicHandle };
}

export function toProject(row: RepoProject) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    type: row.type,
    lifecycle: row.lifecycle,
    repositoryName: row.repositoryName,
    repositoryUrl: row.repositoryUrl,
    prdUrl: row.prdUrl,
    tags: row.tags,
    isPublic: row.isPublic,
    reportingPolicy: {
      staleThresholdMinutes: row.staleThresholdMinutes,
      heartbeatExpected: row.heartbeatExpected,
      instructions: row.reportingInstructions,
    },
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    revision: row.revision,
  };
}

export function toAgent(row: AgentRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    title: row.title,
    workloadType: row.workloadType,
    createdAt: iso(row.createdAt),
  };
}

export function toRepoProjectInput(input: CreateProjectBody): RepoProjectInput {
  return {
    name: input.name,
    description: input.description,
    type: input.type,
    lifecycle: input.lifecycle,
    repositoryName: input.repositoryName,
    repositoryUrl: input.repositoryUrl,
    prdUrl: input.prdUrl,
    tags: input.tags,
    isPublic: input.isPublic ?? false,
    staleThresholdMinutes: input.reportingPolicy.staleThresholdMinutes,
    heartbeatExpected: input.reportingPolicy.heartbeatExpected,
    reportingInstructions: input.reportingPolicy.instructions,
  };
}

export function toRepoProjectPatch(input: PatchProjectBody): Partial<RepoProjectInput> {
  const patch: Partial<RepoProjectInput> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.type !== undefined) patch.type = input.type;
  if (input.lifecycle !== undefined) patch.lifecycle = input.lifecycle;
  if (input.repositoryName !== undefined) patch.repositoryName = input.repositoryName;
  if (input.repositoryUrl !== undefined) patch.repositoryUrl = input.repositoryUrl;
  if (input.prdUrl !== undefined) patch.prdUrl = input.prdUrl;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.isPublic !== undefined) patch.isPublic = input.isPublic;
  if (input.reportingPolicy !== undefined) {
    patch.staleThresholdMinutes = input.reportingPolicy.staleThresholdMinutes;
    patch.heartbeatExpected = input.reportingPolicy.heartbeatExpected;
    patch.reportingInstructions = input.reportingPolicy.instructions;
  }
  return patch;
}

export function toRunPatch(input: PatchRunBody): { patch: RunPatch; prReferences?: PrInput[] } {
  const patch: RunPatch = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.taskId !== undefined) patch.taskId = input.taskId;
  if (input.harness !== undefined) patch.harness = input.harness;
  if (input.model !== undefined) patch.model = input.model;
  if (input.completionSummary !== undefined) patch.completionSummary = input.completionSummary;
  if (input.blocker !== undefined) patch.blocker = input.blocker;
  if (input.noPrReason !== undefined) patch.noPrReason = input.noPrReason;
  return { patch, prReferences: input.prReferences };
}

export function toClosePatch(input: CloseRunBody): RunPatch {
  return { executionState: input.outcome, workStatus: input.outcome, message: input.reason };
}

interface RunGraph {
  run: RunRow;
  prReferences: PrRow[];
  tools: ToolRow[] | null;
  childRunIds: string[];
  events?: EventRow[];
}

export function toRunListItem(graph: RunGraph) {
  return runBody(graph);
}

export function toRunDetail(graph: RunGraph & { events: EventRow[] }) {
  return { ...runBody(graph), events: graph.events.map(toEvent) };
}

function runBody(graph: RunGraph) {
  const row = graph.run;
  return {
    id: row.id,
    projectId: row.projectId,
    agentId: row.agentId,
    taskId: row.taskId,
    title: row.title,
    workloadType: row.workloadType,
    executionState: row.executionState,
    workStatus: row.workStatus,
    startedAt: iso(row.startedAt),
    finishedAt: isoOrNull(row.finishedAt),
    lastContactAt: iso(row.lastContactAt),
    updatedAt: iso(row.updatedAt),
    harness: row.harness,
    model: row.model,
    message: row.message,
    completionSummary: row.completionSummary,
    blocker: row.blocker,
    noPrReason: row.noPrReason,
    parentRunId: row.parentRunId,
    childRunIds: graph.childRunIds,
    prReferences: graph.prReferences.map(toPr),
    tools: graph.tools === null ? null : graph.tools.map(toTool),
    revision: row.revision,
  };
}

function toEvent(row: EventRow) {
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind,
    receivedAt: iso(row.receivedAt),
    occurredAt: isoOrNull(row.occurredAt),
    actorId: actorId(row),
    message: row.message,
    executionState: row.executionState,
    workStatus: row.workStatus,
  };
}

function toPr(row: PrRow) {
  return { number: row.number, title: row.title, url: row.url, repositoryName: row.repositoryName, primary: row.primary };
}

function toTool(row: ToolRow) {
  return {
    name: row.name,
    source: row.source,
    callCount: row.callCount,
    successCount: row.successCount,
    failureCount: row.failureCount,
    lastUsedAt: isoOrNull(row.lastUsedAt),
    coverage: row.coverage,
  };
}

function actorId(row: EventRow): string {
  const id = row.actorUserId ?? row.actorCredentialId;
  if (!id) throw new Error('run event is missing an actor');
  return id;
}

function iso(value: Date): string {
  return value.toISOString();
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function detailFromGetRun(row: {
  events: EventRow[];
  prReferences: PrRow[];
  tools: ToolRow[] | null;
  childRunIds: string[];
} & RunRow) {
  const { events, prReferences, tools, childRunIds, ...run } = row;
  return toRunDetail({ run, events, prReferences, tools, childRunIds });
}
