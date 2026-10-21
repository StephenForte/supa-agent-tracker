import { z } from 'zod';
import { DEMO_LIVE_RUN_IDS, type TrackerState } from './seed';
import type { PrivateNote } from '../../domain/privateNotes';
const time = z.iso.datetime();
const nullableText = z.string().nullable();
const execution = z.enum(['running', 'finished', 'failed', 'cancelled']);
const work = z.enum(['in_progress', 'blocked', 'waiting_for_review', 'completed', 'failed', 'cancelled']);
const workload = z.enum(['coding', 'automation']);
const revision = z.number().int().nonnegative();
const link = z.url().refine(url => ['http:', 'https:'].includes(new URL(url).protocol)).nullable();
export const projectInputSchema = z.object({
  name: z.string().trim().min(1), description: z.string(), type: workload, lifecycle: z.enum(['active', 'paused', 'completed', 'archived']),
  repositoryName: nullableText, repositoryUrl: link, prdUrl: link, tags: z.array(z.string()),
  reportingPolicy: z.object({ staleThresholdMinutes: z.number().positive(), heartbeatExpected: z.boolean(), instructions: z.string() }),
  isPublic: z.boolean().optional(),
});
const project = projectInputSchema.extend({ id: z.string(), ownerId: z.string(), createdAt: time, updatedAt: time, revision });
const agent = z.object({ id: z.string(), projectId: z.string(), name: z.string(), title: z.string(), workloadType: workload, createdAt: time });
const event = z.object({ id: z.string(), runId: z.string(), kind: z.enum(['check_in', 'status', 'heartbeat', 'check_out', 'manual_close']), receivedAt: time, occurredAt: time.nullable(), actorId: z.string(), message: z.string(), executionState: execution, workStatus: work });
const tool = z.object({ name: z.string(), source: z.enum(['mcp', 'native', 'shell', 'other']), callCount: z.number().int().nonnegative(), successCount: z.number().int().nonnegative().nullable(), failureCount: z.number().int().nonnegative().nullable(), lastUsedAt: time.nullable(), coverage: z.enum(['self_reported', 'adapter_captured']) });
const run = z.object({
  id: z.string(), projectId: z.string(), agentId: z.string(), taskId: nullableText, title: z.string(), workloadType: workload,
  executionState: execution, workStatus: work, startedAt: time, finishedAt: time.nullable(), lastContactAt: time, updatedAt: time,
  harness: nullableText, model: nullableText, message: z.string(), completionSummary: nullableText, blocker: nullableText, noPrReason: nullableText,
  parentRunId: nullableText, childRunIds: z.array(z.string()),
  prReferences: z.array(z.object({ number: z.number().int().positive(), title: z.string(), url: link.unwrap(), repositoryName: z.string(), primary: z.boolean() })),
  tools: z.array(tool).nullable(), events: z.array(event), revision,
});
const step = z.object({ id: z.string(), projectId: z.string(), position: z.number(), instruction: z.string(), done: z.boolean(), sourceRunId: z.string(), createdAt: time, updatedAt: time, revision, completionChangedBy: nullableText, completionChangedAt: time.nullable() });
const waiting = z.object({ projectId: z.string(), text: z.string(), sourceRunId: z.string(), updatedAt: time, revision });
const token = z.object({ id: z.string(), label: z.string(), allProjects: z.boolean().default(false), projectIds: z.array(z.string()), display: z.string().startsWith('sat_demo_…'), createdAt: time, lastUsedAt: time.nullable(), revokedAt: time.nullable() });
export const runMetadataPatchSchema = run.pick({ title: true, taskId: true, harness: true, model: true, completionSummary: true, blocker: true, noPrReason: true, prReferences: true }).partial();
export const trackerSchema: z.ZodType<TrackerState> = z.object({
  // Default preserves pre-heartbeat v1 demo edits instead of discarding saved state.
  demoLiveRunIds: z.array(z.enum(DEMO_LIVE_RUN_IDS)).default(() => [...DEMO_LIVE_RUN_IDS]),
  account: z.object({
    id: z.literal('usr_demo'), name: z.string(), email: z.email(), emailVerified: z.boolean(), demo: z.literal(true), publicHandle: z.string().nullable().optional(),
    alerts: z.object({ blocked: z.boolean(), stale: z.boolean(), review: z.boolean() }).default({ blocked: false, stale: false, review: false }),
    publicProfile: z.object({
      name: z.string().nullable(), bio: z.string().nullable(), github: z.string().nullable(), x: z.string().nullable(),
      linkedin: z.string().nullable(), timezone: z.string(), avatarUpdatedAt: z.string().nullable(),
    }).default({ name: null, bio: null, github: null, x: null, linkedin: null, timezone: 'UTC', avatarUpdatedAt: null }),
  }),
  projects: z.array(project), agents: z.array(agent), runs: z.array(run.refine(value => value.executionState === 'running' ? value.finishedAt === null : value.finishedAt !== null)), steps: z.array(step), waitingNotes: z.array(waiting), tokens: z.array(token), sequence: z.number().int().nonnegative(),
}).refine(state => {
  const projects = new Set(state.projects.map(item => item.id));
  const agents = new Map(state.agents.map(item => [item.id, item]));
  const runs = new Map(state.runs.map(item => [item.id, item]));
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  return unique(state.demoLiveRunIds) && state.demoLiveRunIds.every(id => runs.has(id)) && unique(state.projects.map(item => item.id)) && unique(state.agents.map(item => item.id)) && unique(state.runs.map(item => item.id)) && unique(state.steps.map(item => item.id)) && unique(state.tokens.map(item => item.id)) &&
    state.projects.every(item => item.ownerId === state.account.id) && state.agents.every(item => projects.has(item.projectId)) &&
    state.runs.every(item => agents.get(item.agentId)?.projectId === item.projectId && item.events.every(event => event.runId === item.id) &&
      (item.parentRunId === null || (runs.get(item.parentRunId)?.projectId === item.projectId && runs.get(item.parentRunId)?.childRunIds.includes(item.id))) &&
      item.childRunIds.every(id => runs.get(id)?.parentRunId === item.id && runs.get(id)?.projectId === item.projectId)) &&
    [...state.steps, ...state.waitingNotes].every(item => projects.has(item.projectId) && runs.get(item.sourceRunId)?.projectId === item.projectId) &&
    state.tokens.every(item => (!item.allProjects || item.projectIds.length === 0) && item.projectIds.every(id => projects.has(id)));
});
export const notesSchema: z.ZodType<PrivateNote[]> = z.array(z.object({ projectId: z.string(), text: z.string(), updatedAt: time.nullable(), revision }));
