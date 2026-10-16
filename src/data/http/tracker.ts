import type { TrackerDataSource, BrowserAuth } from '../contracts.js';
import type { Account, LogicalAgent, McpToken, NextStep, Project, ProjectNextSteps, Run, TokenIssueResult } from '../../domain/types.js';
import { actionFields, HttpError, nullable, pages, segment, write, type HttpClient } from './client.js';
import { createObservable, type Visibility } from './observable.js';
export function createHttpTracker(client: HttpClient, visibility?: Visibility, onSessionChange: () => void = () => {}): TrackerDataSource {
  const observable = createObservable(visibility);
  const stepProjects = new Map<string, string>();
  async function mutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = await operation();
    if (result && typeof result === 'object' && 'status' in result && (result.status === 'saved' || result.status === 'created' || result.status === 'conflict')) observable.changed();
    return result;
  }
  async function issue(path: string, body: unknown): Promise<TokenIssueResult> {
    try {
      const result = await client.request<{ token: McpToken; plaintext: string | null }>(path, 'POST', body);
      observable.changed();
      return result.plaintext === null ? { status: 'invalid', message: 'This token was already issued. Create or rotate a token to reveal a new value.' } : { status: 'created', ...result, plaintext: result.plaintext };
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status === 404) return { status: 'not_found' };
        if (error.status === 400) return { status: 'invalid', message: error.message };
        if (error.status === 409 && error.current !== undefined) { observable.changed(); return { status: 'conflict', current: error.current as McpToken }; }
      }
      throw error;
    }
  }
  const auth: BrowserAuth = {
    getSession: () => observable.read('session', async () => { const result = await client.request<{ user: { id: string; name: string; email: string; emailVerified: boolean } } | null>('/api/auth/get-session'); return result ? { ...result.user, demo: false } : null; }),
    async submit(action, body = {}) {
      const result = await client.request<unknown>(`/api/auth/${action}`, 'POST', body); onSessionChange(); observable.changed(); return result;
    },
    async verify(token) { await client.request(`/api/auth/verify-email?token=${segment(token)}`); observable.changed(); },
  };
  return {
    subscribe: observable.subscribe, getSnapshot: observable.getSnapshot, observe: observable.observe, auth,
    getAccount: () => observable.read('account', async () => ({ ...await client.request<Omit<Account, 'demo'>>('/api/account'), demo: false })),
    listProjects: () => observable.read('projects', () => pages<Project>(client, '/api/projects?include_archived=true')),
    getProject: id => observable.read(`project:${id}`, () => nullable(() => client.request<Project>(`/api/projects/${segment(id)}`))),
    createProject: input => mutation(() => write<Project>(client, '/api/projects', 'POST', { ...input, ...actionFields() })),
    updateProject: (id, patch, revision) => mutation(() => write<Project>(client, `/api/projects/${segment(id)}`, 'PATCH', { ...patch, expected_revision: revision, ...actionFields() })),
    listAgents: id => observable.read(`agents:${id ?? ''}`, () => pages<LogicalAgent>(client, `/api/agents${id ? `?project_id=${segment(id)}` : ''}`)),
    listRuns: id => observable.read(`runs:${id ?? ''}`, async () => (await pages<Omit<Run, 'events'>>(client, `/api/runs${id ? `?project_id=${segment(id)}` : ''}`)).map(run => ({ ...run, events: [] }))),
    getRun: id => observable.read(`run:${id}`, () => nullable(() => client.request<Run>(`/api/runs/${segment(id)}`))),
    updateRunMetadata: (id, patch, revision) => mutation(() => write<Run>(client, `/api/runs/${segment(id)}`, 'PATCH', { ...patch, expected_revision: revision, ...actionFields() })),
    closeRun: (id, outcome, reason) => mutation(async () => {
      const run = await nullable(() => client.request<Run>(`/api/runs/${segment(id)}`));
      return run ? write<Run>(client, `/api/runs/${segment(id)}/close`, 'POST', { outcome, reason, expected_revision: run.revision, ...actionFields() }) : { status: 'not_found' as const };
    }),
    listNextSteps: id => observable.read(`steps:${id}`, async () => {
      const bundle = await client.request<ProjectNextSteps>(`/api/projects/${segment(id)}/next-steps`);
      for (const [step, project] of stepProjects) if (project === id) stepProjects.delete(step);
      bundle.steps.forEach(step => stepProjects.set(step.id, id)); return bundle;
    }),
    setNextStepDone: (id, done, revision) => mutation(async () => {
      const project = stepProjects.get(id);
      return project ? write<NextStep>(client, `/api/projects/${segment(project)}/next-steps/${segment(id)}/completion`, 'POST', { done, expected_revision: revision, ...actionFields() }) : { status: 'not_found' as const };
    }),
    async simulateAgentStepUpdate() { return { status: 'invalid', message: 'Agent simulation is available only in the demo.' }; },
    listTokens: () => observable.read('tokens', () => client.request<McpToken[]>('/api/tokens')),
    createToken: input => issue('/api/tokens', { label: input.label, project_ids: input.projectIds, ...actionFields() }),
    revokeToken: id => mutation(async () => {
      const token = (await client.request<(McpToken & { revision: number })[]>('/api/tokens')).find(token => token.id === id);
      if (!token) return { status: 'not_found' as const };
      const result = await write<{ token: McpToken }>(client, `/api/tokens/${segment(id)}/revoke`, 'POST', { expected_revision: token.revision, ...actionFields() });
      // The server's conflict value is metadata, while successful revoke is wrapped.
      return result.status === 'saved' ? { status: 'saved' as const, value: result.value.token } : result.status === 'conflict' ? { status: 'conflict' as const, current: result.current as unknown as McpToken } : result;
    }),
    rotateToken: async id => {
      const token = (await client.request<(McpToken & { revision: number })[]>('/api/tokens')).find(token => token.id === id);
      return token ? issue(`/api/tokens/${segment(id)}/rotate`, { expected_revision: token.revision, ...actionFields() }) : { status: 'not_found' };
    },
    async resetDemo() { throw new Error('Reset demo is unavailable for live accounts.'); },
  };
}
