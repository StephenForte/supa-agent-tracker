import { afterAll, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../app/build-app.js';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { migrationsDir, spaRoot } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { createHttpSources } from '../../src/data/http/createHttpSources.js';
import { SessionExpiredError } from '../../src/data/http/client.js';

let scratch: ScratchDatabase; let pool: pg.Pool; let app: FastifyInstance; let mcp: Client | undefined;
const publicUrl = 'http://localhost:3999'; const email = 'p1e@example.test';
let baseUrl: string;
beforeAll(async () => {
  scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString); await runMigrations(pool, migrationsDir);
  const config = loadConfig({ DATABASE_URL: scratch.connectionString, PUBLIC_URL: publicUrl, NODE_ENV: 'test',
    BETTER_AUTH_SECRET: 'p1e-test-secret-at-least-thirty-two-characters', EMAIL_PROVIDER: 'console', REGISTRATION_ALLOWLIST: email });
  app = await buildApp({ config, pool, migrationsDir, spaRoot, logger: false });
  baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
});
afterAll(async () => { await mcp?.close(); await app?.close(); await pool?.end(); await scratch?.drop(); });

it('drives browser HTTP sources through real auth, MCP check-in/steps, run detail, close and private notes', async () => {
  const cookies = new Map<string, string>(); let expired = 0;
  const browserFetch: typeof globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers); headers.set('Origin', publicUrl);
    if (cookies.size) headers.set('cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(new URL(String(input), baseUrl), { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]!; const index = pair.indexOf('='); const name = pair.slice(0, index); const value = pair.slice(index + 1);
      if (value) cookies.set(name, value); else cookies.delete(name);
    }
    return response;
  };
  const { tracker, privateNotes } = createHttpSources({ fetch: browserFetch, onUnauthorized: () => { expired++; } });
  const auth = tracker.auth!; const password = 'p1e-unique-test-password-123!';
  expect(await auth.getSession()).toBeNull();
  await auth.submit('sign-up/email', { email, name: 'P1-E Test', password });
  const captured = app.browserAuth!.email.captured;
  expect(captured).toHaveLength(1);
  const token = new URL(captured[0]!.text.split(' ').at(-1)!).searchParams.get('token')!;
  await auth.verify(token); await auth.submit('sign-in/email', { email, password });
  expect(await tracker.getAccount()).toMatchObject({ email, emailVerified: true, demo: false });
  const project = await tracker.createProject({ name: 'HTTP Sources', description: '', type: 'automation', lifecycle: 'active', repositoryName: null, repositoryUrl: null, prdUrl: null, tags: [], reportingPolicy: { staleThresholdMinutes: 15, heartbeatExpected: true, instructions: '' } });
  expect(project.status).toBe('saved'); if (project.status !== 'saved') throw new Error('Project not saved');
  const projectId = project.value.id;
  const issued = await tracker.createToken({ label: 'Browser-issued MCP', projectIds: [projectId] });
  expect(issued.status).toBe('created'); if (issued.status !== 'created') throw new Error('Token not issued');
  expect(issued.plaintext).toMatch(/^sat_/);
  const listed = await tracker.listTokens(); expect(JSON.stringify(listed)).not.toContain(issued.plaintext); expect(listed[0]?.display).toContain(issued.plaintext.slice(-4));
  mcp = new Client({ name: 'p1e-e2e', version: '1.0.0' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl), { requestInit: { headers: { Authorization: `Bearer ${issued.plaintext}` } } }));
  async function tool(name: string, args: Record<string, unknown>) {
    const result = await mcp!.callTool({ name, arguments: args }); expect(result.isError).not.toBe(true);
    const content = result.content as { type: string; text?: string }[]; return JSON.parse(content[0]!.text!) as Record<string, unknown>;
  }
  const checkin = await tool('check_in', { project_id: projectId, agent_name: 'p1e-e2e', title: 'Real HTTP flow', workload_type: 'automation', request_id: crypto.randomUUID() });
  const runId = String(checkin.run_id);
  const step = await tool('create_next_step', { project_id: projectId, source_run_id: runId, instruction: 'Verify P1-E', request_id: crypto.randomUUID() });
  const runs = await tracker.listRuns(projectId); expect(runs).toHaveLength(1); expect(runs[0]).toMatchObject({ id: runId, events: [] });
  const detail = await tracker.getRun(runId); expect(detail!.events.some(e => e.kind === 'check_in')).toBe(true);
  const closed = await tracker.closeRun(runId, 'cancelled', 'E2E complete'); expect(closed).toMatchObject({ status: 'saved', value: { executionState: 'cancelled' } });
  const steps = await tracker.listNextSteps(projectId); expect(steps.steps[0]?.id).toBe(step.id);
  expect(await tracker.setNextStepDone(String(step.id), true, steps.steps[0]!.revision)).toMatchObject({ status: 'saved', value: { done: true } });
  expect(await privateNotes.save(projectId, 'Private browser reminder', 0)).toMatchObject({ status: 'saved' });
  expect(await privateNotes.get(projectId)).toMatchObject({ text: 'Private browser reminder' });
  expect(JSON.stringify(await tool('get_project', { project_id: projectId }))).not.toContain('Private browser reminder');
  await auth.submit('sign-out'); await expect(tracker.listProjects()).rejects.toBeInstanceOf(SessionExpiredError); await expect(privateNotes.get(projectId)).rejects.toBeInstanceOf(SessionExpiredError); expect(expired).toBe(2);
}, 20000);
