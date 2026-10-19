import type { TrackerDataSource } from '../contracts';
import type { McpToken, Project, ProjectInput, TokenIssueResult } from '../../domain/types';
import type { Clock } from '../../domain/clock';
import { seedTracker, type TrackerState } from './seed';
import { observable } from './observable';
import { projectInputSchema, runMetadataPatchSchema } from './schema';
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
export interface TrackerStoreOptions { clock: Clock; initial?: TrackerState; persist(state: TrackerState): void; onReset(now: number): void }
export function createTrackerStore({ clock, initial, persist, onReset }: TrackerStoreOptions) {
  let state = structuredClone(initial ?? seedTracker(clock.now()));
  const changes = observable();
  const copy = <T,>(value: T): T => structuredClone(value);
  const timestamp = () => new Date(clock.now()).toISOString();
  const commit = () => { persist(copy(state)); changes.notify(); };
  /** Synthetic liveness only: preserve narrative activity, revisions, history and elapsed origins.
   * Clock notifications update the shared state before readers run; no read method mutates it.
   * Refresh at most once per minute (sooner for short project thresholds), including after sleep.
   */
  function heartbeat() {
    const now = clock.now();
    let changed = false;
    for (const run of state.runs) {
      if (run.executionState !== 'running' || !state.demoLiveRunIds.includes(run.id)) continue;
      const project = state.projects.find(item => item.id === run.projectId)!;
      const interval = Math.min(60_000, project.reportingPolicy.staleThresholdMinutes * 30_000);
      if (now - Date.parse(run.lastContactAt) < interval) continue;
      run.lastContactAt = new Date(now).toISOString();
      changed = true;
    }
    if (changed) commit();
  }
  function issue(label: string, projectIds: string[], allProjects = false): TokenIssueResult {
    if (!label.trim()) return { status: 'invalid', message: 'Provide a label and at least one existing project scope.' };
    if (allProjects) {
      if (projectIds.length) return { status: 'invalid', message: 'All my projects cannot also list specific projects.' };
    } else if (projectIds.some(id => !state.projects.some(project => project.id === id))) {
      return { status: 'invalid', message: 'Provide a label and at least one existing project scope.' };
    }
    const suffix = crypto.randomUUID();
    const token: McpToken = { id: `tok_${++state.sequence}`, label: label.trim(), allProjects, projectIds: allProjects ? [] : [...new Set(projectIds)], display: `sat_demo_…${suffix.slice(-6)}`, createdAt: timestamp(), lastUsedAt: null, revokedAt: null };
    state.tokens.push(token);
    return { status: 'created', token: copy(token), plaintext: `sat_demo_NOT_A_REAL_TOKEN_${suffix}` };
  }
  const source: TrackerDataSource = {
    subscribe: changes.subscribe, getSnapshot: changes.getSnapshot,
    async getAccount() { return copy(state.account); },
    async updateAccount(input) {
      if (input.publicHandle === null) { state.account = { ...state.account, publicHandle: null }; commit(); return { status: 'saved', value: copy(state.account) }; }
      const handle = input.publicHandle.trim().toLowerCase();
      if (!HANDLE_PATTERN.test(handle)) return { status: 'invalid', message: 'Use 3–32 letters, numbers, or hyphens, starting and ending with a letter or number.' };
      state.account = { ...state.account, publicHandle: handle }; commit(); return { status: 'saved', value: copy(state.account) };
    },
    async listProjects() { return copy(state.projects); },
    async getProject(id) { return copy(state.projects.find(project => project.id === id) ?? null); },
    async createProject(input) {
      const parsed = projectInputSchema.safeParse(input);
      if (!parsed.success) return { status: 'invalid', message: 'A name, valid metadata, HTTP(S) links and positive stale threshold are required.' };
      const project: Project = { ...parsed.data, isPublic: parsed.data.isPublic ?? false, id: `prj_demo_${++state.sequence}`, ownerId: state.account.id, revision: 1, createdAt: timestamp(), updatedAt: timestamp() };
      state.projects.push(project); commit(); return { status: 'saved', value: copy(project) };
    },
    async updateProject(id, patch, expectedRevision) {
      const project = state.projects.find(item => item.id === id);
      if (!project) return { status: 'not_found' };
      if (project.revision !== expectedRevision) return { status: 'conflict', current: copy(project) };
      // Explicit allowlist prevents caller-supplied IDs, ownership or extra fields entering records.
      const input: ProjectInput = { name: patch.name ?? project.name, description: patch.description ?? project.description,
        type: patch.type ?? project.type, lifecycle: patch.lifecycle ?? project.lifecycle,
        repositoryName: patch.repositoryName === undefined ? project.repositoryName : patch.repositoryName,
        repositoryUrl: patch.repositoryUrl === undefined ? project.repositoryUrl : patch.repositoryUrl,
        prdUrl: patch.prdUrl === undefined ? project.prdUrl : patch.prdUrl,
        tags: patch.tags ?? project.tags, reportingPolicy: patch.reportingPolicy ?? project.reportingPolicy,
        isPublic: patch.isPublic === undefined ? project.isPublic === true : patch.isPublic };
      const parsed = projectInputSchema.safeParse(input);
      if (!parsed.success) return { status: 'invalid', message: 'Invalid project metadata or reporting policy.' };
      Object.assign(project, parsed.data, { revision: project.revision + 1, updatedAt: timestamp() });
      commit(); return { status: 'saved', value: copy(project) };
    },
    async listAgents(projectId) { return copy(state.agents.filter(agent => !projectId || agent.projectId === projectId)); },
    async listRuns(projectId) { return copy(state.runs.filter(run => !projectId || run.projectId === projectId)); },
    async getRun(id) { return copy(state.runs.find(run => run.id === id) ?? null); },
    async updateRunMetadata(id, patch, expectedRevision) {
      const run = state.runs.find(item => item.id === id);
      if (!run) return { status: 'not_found' };
      if (run.revision !== expectedRevision) return { status: 'conflict', current: copy(run) };
      const parsed = runMetadataPatchSchema.safeParse(patch);
      if (!parsed.success || (parsed.data.title !== undefined && !parsed.data.title.trim())) return { status: 'invalid', message: 'Provide valid run metadata and HTTP(S) PR links.' };
      const now = timestamp();
      Object.assign(run, parsed.data, { updatedAt: now, revision: run.revision + 1 });
      run.events.push({ id: `evt_demo_${++state.sequence}`, runId: id, kind: 'status', receivedAt: now, occurredAt: null, actorId: state.account.id, message: 'Operator corrected run metadata.', executionState: run.executionState, workStatus: run.workStatus });
      commit(); return { status: 'saved', value: copy(run) };
    },
    async closeRun(id, outcome, reason) {
      const run = state.runs.find(item => item.id === id);
      if (!run) return { status: 'not_found' };
      if (run.executionState !== 'running') return { status: 'invalid', message: 'Only running executions may be manually closed.' };
      if (!['failed', 'cancelled'].includes(outcome) || !reason.trim()) return { status: 'invalid', message: 'Choose Failed or Cancelled and provide an audit reason.' };
      const now = timestamp();
      Object.assign(run, { executionState: outcome, workStatus: outcome, finishedAt: now, updatedAt: now, message: reason.trim(), revision: run.revision + 1 });
      run.events.push({ id: `evt_demo_${++state.sequence}`, runId: id, kind: 'manual_close', receivedAt: now, occurredAt: null, actorId: state.account.id, message: reason.trim(), executionState: outcome, workStatus: outcome });
      commit(); return { status: 'saved', value: copy(run) };
    },
    async markRunDone(id) {
      const run = state.runs.find(item => item.id === id);
      if (!run) return { status: 'not_found' };
      if (run.executionState !== 'finished') return { status: 'invalid', message: 'Only finished runs can be marked done.' };
      if (run.workStatus === 'completed') return { status: 'conflict', current: copy(run) };
      Object.assign(run, { workStatus: 'completed', revision: run.revision + 1, updatedAt: timestamp() });
      commit(); return { status: 'saved', value: copy(run) };
    },
    async listNextSteps(id) { return copy({ steps: state.steps.filter(step => step.projectId === id).sort((a, b) => a.position - b.position), waitingNote: state.waitingNotes.find(note => note.projectId === id) ?? null }); },
    async setNextStepDone(id, done, expectedRevision) {
      const step = state.steps.find(item => item.id === id);
      if (!step) return { status: 'not_found' };
      if (step.revision !== expectedRevision) return { status: 'conflict', current: copy(step) };
      Object.assign(step, { done, revision: step.revision + 1, updatedAt: timestamp(), completionChangedBy: state.account.id, completionChangedAt: timestamp() });
      commit(); return { status: 'saved', value: copy(step) };
    },
    async simulateAgentStepUpdate(id, instruction, sourceRunId, expectedRevision) {
      const step = state.steps.find(item => item.id === id);
      if (!step) return { status: 'not_found' };
      if (step.revision !== expectedRevision) return { status: 'conflict', current: copy(step) };
      if (sourceRunId !== step.sourceRunId || !state.runs.some(run => run.id === sourceRunId && run.projectId === step.projectId)) return { status: 'invalid', message: 'A worker can update only its own contributed step.' };
      if (!instruction.trim()) return { status: 'invalid', message: 'An instruction is required.' };
      Object.assign(step, { instruction: instruction.trim(), updatedAt: timestamp(), revision: step.revision + 1 });
      commit(); return { status: 'saved', value: copy(step) };
    },
    async listTokens() { return copy(state.tokens); },
    async createToken(input) { const result = issue(input.label, input.projectIds, input.allProjects === true); if (result.status === 'created') commit(); return result; },
    async revokeToken(id) {
      const token = state.tokens.find(item => item.id === id);
      if (!token) return { status: 'not_found' };
      token.revokedAt ??= timestamp(); commit(); return { status: 'saved', value: copy(token) };
    },
    async updateTokenScope(id, input) {
      const token = state.tokens.find(item => item.id === id);
      if (!token) return { status: 'not_found' };
      if (token.revokedAt !== null) return { status: 'invalid', message: 'Revoked tokens cannot change scope.' };
      if (input.allProjects) {
        if (input.projectIds.length) return { status: 'invalid', message: 'All my projects cannot also list specific projects.' };
        token.allProjects = true; token.projectIds = [];
      } else {
        if (input.projectIds.some(projectId => !state.projects.some(project => project.id === projectId))) return { status: 'invalid', message: 'Choose projects that exist in this demo.' };
        token.allProjects = false; token.projectIds = [...new Set(input.projectIds)];
      }
      commit(); return { status: 'saved', value: copy(token) };
    },
    async rotateToken(id) {
      const token = state.tokens.find(item => item.id === id);
      if (!token) return { status: 'not_found' };
      if (token.revokedAt !== null) return { status: 'invalid', message: 'Revoked tokens cannot be rotated.' };
      const result = issue(token.label, token.allProjects ? [] : token.projectIds, token.allProjects);
      if (result.status === 'created') { token.revokedAt = timestamp(); commit(); }
      return result;
    },
    async resetDemo() { const now = clock.now(); state = seedTracker(now); onReset(now); changes.notify(); },
  };
  // Reconcile persisted contacts immediately, then keep them fresh for this store's lifetime.
  const stopHeartbeat = clock.subscribe(heartbeat);
  heartbeat();
  return { source, dispose: stopHeartbeat };
}
