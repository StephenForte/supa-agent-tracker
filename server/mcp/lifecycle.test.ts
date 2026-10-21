import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { createDb, type AppDatabase } from '../db/client.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { migrationsDir } from '../paths.js';
import { users } from '../db/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { buildApp } from '../app/build-app.js';
import { createLoggerOptions } from '../app/logging.js';
import { createProject, type Project } from '../repo/projects.js';
import { createAgent } from '../repo/agents.js';
import { createRun, getRun } from '../repo/runs.js';
import { getCredential } from '../repo/credentials.js';
import { createNextStep, setStepCompletion, setWaitingNote } from '../repo/next-steps.js';
import { setPrivateNote } from '../repo/private-notes.js';
import { registerMcpRoutes, CREDENTIAL_REQUESTS_PER_MINUTE } from './routes.js';

const owner = { kind: 'user' as const, userId: 'mcp-owner' };
let scratch: ScratchDatabase; let pool: pg.Pool; let db: AppDatabase; let app: FastifyInstance; let base: string;
let x: Project; let y: Project; let foreign: Project; let parentId: string;
let plaintext: string; let tokenId: string; let client: Client;
const clients: Client[] = []; const secrets: string[] = []; const responses: unknown[] = []; const logs: string[] = [];
const note = 'PRIVATE-NOTE-MUST-NEVER-LEAVE-78dfc2';
async function connect(token: string) {
  const value = new Client({ name: 'observed-test-client', version: '2.0' });
  clients.push(value);
  await value.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'test-UA' } } }));
  return value;
}
interface ToolResponse {
  error: { code: string; details?: unknown }; run_id: string; revision: number; finished_at: string;
  running_runs: unknown[]; api_version: string; items: { id: string }[];
}
async function call(name: string, args: Record<string, unknown>, c = client): Promise<ToolResponse> {
  const result = await c.callTool({ name, arguments: args });
  responses.push(result);
  const content = result.content as { text: string }[];
  return JSON.parse(content[0]!.text) as ToolResponse;
}
async function issue(request_id: string, projectIds = [x.id]) {
  const response = await app.inject({ method: 'POST', url: '/api/tokens', headers: { 'x-test-user-id': owner.userId }, payload: { label: 'Agent', project_ids: projectIds, request_id } });
  expect(response.statusCode).toBe(200);
  const result = response.json(); if (result.plaintext) secrets.push(result.plaintext);
  return result;
}
async function edit(action: string, id: string, expected_revision: number, request_id: string) {
  return app.inject({ method: 'POST', url: `/api/tokens/${id}/${action}`, headers: { 'x-test-user-id': owner.userId }, payload: { expected_revision, request_id } });
}
const checkIn = (request_id: string) => ({ project_id: x.id, agent_name: 'worker', title: 'Implement MCP', workload_type: 'coding', task_id: 'P1-C1', request_id });

describe('MCP and tokens over real Postgres and the SDK HTTP client', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString); db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([{ id: owner.userId, email: 'mcp@example.com' }, { id: 'other-owner', email: 'other@example.com' }]);
    x = await createProject(db, owner, { name: 'X', type: 'coding', reportingInstructions: 'Report work honestly', heartbeatExpected: true });
    y = await createProject(db, owner, { name: 'Y', type: 'automation' });
    foreign = await createProject(db, { kind: 'user', userId: 'other-owner' }, { name: 'Foreign', type: 'automation' });
    const agent = await createAgent(db, owner, y.id, { name: 'parent', title: 'Parent', workloadType: 'automation' });
    parentId = (await createRun(db, owner, y.id, { agentId: agent.id, title: 'Parent', workloadType: 'automation' })).id;
    await setPrivateNote(db, owner, x.id, 0, note);
    app = await buildApp({ config: { databaseUrl: scratch.connectionString, publicUrl: 'https://tracker.example/path', nodeEnv: 'test', port: 0, migrateOnBoot: false },
      pool, migrationsDir, spaRoot: new URL('../../dist', import.meta.url).pathname, logger: createLoggerOptions({ write: (value) => logs.push(value) }) });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
    const issued = await issue('first-token'); plaintext = issued.plaintext; tokenId = issued.token.id;
    client = await connect(plaintext);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close())); await app?.close(); await pool?.end(); await scratch?.drop();
  });
  it('exposes seven tools, server version, api_version and protected resource metadata', async () => {
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['list_projects', 'get_project', 'check_in', 'update_status', 'heartbeat', 'check_out', 'record_tool_usage', 'list_next_steps', 'create_next_step', 'update_next_step', 'reorder_next_steps', 'set_waiting_note']);
    expect(client.getServerVersion()).toMatchObject({ name: 'supa-agent-tracker', version: '1.0.0' });
    const raw = await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${plaintext}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-test', version: '1' } } }) });
    expect(((await raw.json()) as { result: { serverInfo: { api_version: string } } }).result.serverInfo.api_version).toBe('1');
    await fetch(`${base}/mcp`, { method: 'DELETE', headers: { Authorization: `Bearer ${plaintext}`, 'mcp-session-id': raw.headers.get('mcp-session-id')! } });
    expect((await app.inject('/.well-known/oauth-protected-resource')).json()).toMatchObject({ resource: 'https://tracker.example/mcp', bearer_methods_supported: ['header'] });
  });
  it('completes the run lifecycle, preserving revision on heartbeats and review status after finish', async () => {
    const start = await call('check_in', checkIn('flow-in'));
    expect(start).toMatchObject({ revision: 1, reporting_policy: { heartbeat_expected: true } });
    const replay = await call('check_in', checkIn('flow-in')); expect(replay).toEqual(start);
    const access = { kind: 'credential' as const, userId: owner.userId, credentialId: tokenId, projectIds: [x.id] };
    const open = await createNextStep(db, access, x.id, { instruction: 'Review the PR', position: 0, sourceRunId: start.run_id });
    const done = await createNextStep(db, access, x.id, { instruction: 'Already reviewed', position: 1, sourceRunId: start.run_id });
    await setStepCompletion(db, owner, x.id, done.id, 1, true);
    await setWaitingNote(db, access, x.id, 0, { text: 'Awaiting human review', sourceRunId: start.run_id });
    const active = await call('get_project', { project_id: x.id });
    expect(active).toMatchObject({ open_to_dos: [{ id: open.id }], waiting_note: { text: 'Awaiting human review' }, running_runs: [{ id: start.run_id }] });

    expect((await pool.query('select count(*)::int n from runs where project_id=$1', [x.id])).rows[0].n).toBe(1);
    expect((await call('check_in', { ...checkIn('flow-in'), title: 'Different' })).error.code).toBe('idempotency_mismatch');
    expect((await call('check_in', { ...checkIn('flow-in'), title: 'Implement MCP ' })).error.code).toBe('idempotency_mismatch');
    expect((await call('update_status', { run_id: start.run_id, expected_revision: 1, work_status: 'waiting_for_review', request_id: 'flow-update' })).revision).toBe(2);
    const beat = await call('heartbeat', { run_id: start.run_id, request_id: 'flow-beat' }); expect(beat.revision).toBe(2);
    expect(await call('heartbeat', { run_id: start.run_id, request_id: 'flow-beat' })).toEqual(beat);
    const conflict = await call('update_status', { run_id: start.run_id, expected_revision: 1, message: 'stale', request_id: 'stale' });
    expect(conflict.error).toMatchObject({ code: 'conflict', details: { current: { id: start.run_id, revision: 2 } } });
    expect((await call('record_tool_usage', { run_id: start.run_id, tools: [{ name: 'compiler', source: 'shell', callCount: 1 }], request_id: 'flow-tools' })).revision).toBe(3);
    const finish = await call('check_out', { run_id: start.run_id, expected_revision: 3, execution_state: 'finished', work_status: 'waiting_for_review', completion_summary: 'Ready for review', no_pr_reason: 'Synthetic test', request_id: 'flow-out' });
    expect(finish).toMatchObject({ revision: 4, work_status: 'waiting_for_review' }); expect(finish.finished_at).toBeTruthy();
    expect((await call('heartbeat', { run_id: start.run_id, request_id: 'late' })).error.code).toBe('validation_error');
    const run = await getRun(db, owner, x.id, start.run_id);
    expect(run).toMatchObject({ executionState: 'finished', workStatus: 'waiting_for_review', revision: 4, harness: null, model: null,
      observedClientInfo: { name: 'observed-test-client', version: '2.0' }, observedUserAgent: 'test-UA' });
    expect(run.events.filter((e) => e.kind === 'heartbeat')).toHaveLength(1);
    expect(run.tools?.[0]?.coverage).toBe('self_reported');
    const project = await call('get_project', { project_id: x.id }); expect(project.running_runs).toEqual([]); expect(project.api_version).toBe('1');
    expect((await call('list_projects', { limit: 1 })).items.map((r: { id: string }) => r.id)).toEqual([x.id]);
  });
  it('uses stored scope for project, run and parent IDs, including another owner', async () => {
    expect((await call('list_projects', {})).items.map((project) => project.id)).toEqual([x.id]);
    for (const project_id of [y.id, foreign.id]) {
      expect((await call('get_project', { project_id })).error.code).toBe('not_found');
      expect((await call('check_in', { ...checkIn(`scope-${project_id}`), project_id })).error.code).toBe('not_found');
    }
    expect((await call('check_in', { ...checkIn('foreign-parent'), parent_run_id: parentId })).error.code).toBe('not_found');
    expect((await call('heartbeat', { run_id: parentId, request_id: 'foreign-heartbeat' })).error.code).toBe('not_found');
    expect((await call('check_in', { ...checkIn('injected-scope'), project_ids: [y.id] })).error.code).toBe('validation_error');
  });
  it('isolates token administration by owner and rejects foreign grants atomically', async () => {
    const foreignIssue = await app.inject({ method: 'POST', url: '/api/tokens', headers: { 'x-test-user-id': owner.userId }, payload: { label: 'Denied', project_ids: [foreign.id], request_id: 'foreign-grant' } });
    expect(foreignIssue.statusCode).toBe(404);
    const otherList = await app.inject({ url: '/api/tokens', headers: { 'x-test-user-id': 'other-owner' } }); expect(otherList.json()).toEqual([]);
    expect((await app.inject({ method: 'POST', url: `/api/tokens/${tokenId}/revoke`, headers: { 'x-test-user-id': 'other-owner' }, payload: { request_id: 'steal', expected_revision: 1 } })).statusCode).toBe(404);
    expect((await getCredential(db, owner, tokenId)).revokedAt).toBeNull();
  });
  it('rejects session reuse by a different credential and paginates granted projects', async () => {
    const wide = await issue('wide-token', [x.id, y.id]);
    const wideClient = await connect(wide.plaintext);
    const first = await call('list_projects', { limit: 1 }, wideClient);
    const page = first as ToolResponse & { nextCursor: string };
    const second = await call('list_projects', { limit: 1, cursor: page.nextCursor }, wideClient);
    expect(new Set([...first.items, ...second.items].map((project) => project.id))).toEqual(new Set([x.id, y.id]));
    const raw = await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${plaintext}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'session-owner', version: '1' } } }) });
    const session = raw.headers.get('mcp-session-id')!; await raw.text();
    expect((await app.inject({ url: '/mcp', headers: { authorization: `Bearer ${wide.plaintext}`, 'mcp-session-id': session } })).statusCode).toBe(404);
    await fetch(`${base}/mcp`, { method: 'DELETE', headers: { Authorization: `Bearer ${plaintext}`, 'mcp-session-id': session } });
    expect((await call('get_project', { project_id: y.id }, wideClient)).api_version).toBe('1');
  });
  it('reuses logical agents across distinct executions and keeps automation fields unknown', async () => {
    const a = await call('check_in', { project_id: x.id, agent_name: 'daily', title: 'Daily', workload_type: 'automation', request_id: 'daily-1' });
    const b = await call('check_in', { project_id: x.id, agent_name: 'daily', title: 'Daily again', workload_type: 'automation', request_id: 'daily-2' });
    expect(a.run_id).not.toBe(b.run_id);
    const first = await getRun(db, owner, x.id, a.run_id); const second = await getRun(db, owner, x.id, b.run_id);
    expect(first.agentId).toBe(second.agentId); expect(first.taskId).toBeNull(); expect(first.harness).toBeNull(); expect(first.model).toBeNull();
    expect((await call('check_out', { run_id: a.run_id, expected_revision: 1, execution_state: 'finished', work_status: 'completed', request_id: 'daily-out' })).revision).toBe(2);
    expect((await call('get_project', { project_id: x.id })).running_runs).toHaveLength(1);
    expect((await call('private_notes', { project_id: x.id })).error.code).toBe('not_found');
  });
  it('validates coding requirements and bounded payloads with stable safe errors', async () => {
    expect((await call('check_in', { ...checkIn('missing-task'), task_id: undefined })).error.code).toBe('validation_error');
    const start = await call('check_in', checkIn('validation-in'));
    expect((await call('check_out', { run_id: start.run_id, expected_revision: 1, execution_state: 'finished', work_status: 'completed', no_pr_reason: 'No PR', request_id: 'missing-summary' })).error.code).toBe('validation_error');
    expect((await call('check_in', { ...checkIn('oversize'), title: 'x'.repeat(201) })).error.code).toBe('validation_error');
    expect((await call('record_tool_usage', { run_id: start.run_id, tools: Array.from({ length: 101 }, () => ({ name: 'x', source: 'other', callCount: 0 })), request_id: 'too-many' })).error.code).toBe('validation_error');
    expect((await call('record_tool_usage', { run_id: start.run_id, tools: [{ name: 'bad', source: 'other', callCount: 1, successCount: 2 }], request_id: 'bad-count' })).error.code).toBe('validation_error');
    expect((await getRun(db, owner, x.id, start.run_id)).tools).toBeNull();
  });
  it('rejects unsafe PR URLs and accepts a named HTTP PR as the checkout handoff', async () => {
    const start = await call('check_in', checkIn('pr-in'));
    for (const url of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///etc/passwd']) {
      expect((await call('update_status', { run_id: start.run_id, expected_revision: 1, pr_references: [{ number: 42, title: 'Unsafe', repositoryName: 'owner/repo', url }], request_id: `unsafe-${url.split(':')[0]}` })).error.code).toBe('validation_error');
    }
    expect((await call('update_status', { run_id: start.run_id, expected_revision: 1, pr_references: [{ number: 42, title: 'Named PR', repositoryName: 'owner/repo', url: 'https://github.com/owner/repo/pull/42', primary: true }], request_id: 'safe-pr' })).revision).toBe(2);
    const out = { run_id: start.run_id, expected_revision: 2, execution_state: 'finished', work_status: 'waiting_for_review', completion_summary: 'Named PR ready', request_id: 'pr-out' };
    const finish = await call('check_out', out); expect(finish.revision).toBe(3);
    expect(await call('check_out', out)).toEqual(finish);
    expect((await call('check_out', { ...out, request_id: 'stale-checkout' })).error).toMatchObject({ code: 'conflict', details: { current: { id: start.run_id, revision: 3 } } });
    const run = await getRun(db, owner, x.id, start.run_id); expect(run.prReferences[0]).toMatchObject({ number: 42, title: 'Named PR' });
  });
  it('keeps copy-once issuance and rotation atomic, last-used revision stable and revocation immediate', async () => {
    expect((await issue('first-token')).plaintext).toBeNull();
    const changed = await app.inject({ method: 'POST', url: '/api/tokens', headers: { 'x-test-user-id': owner.userId }, payload: { label: 'Agent ', project_ids: [x.id], request_id: 'first-token' } });
    expect(changed.statusCode).toBe(409); expect(changed.json().error.code).toBe('idempotency_mismatch');
    const listing = await app.inject({ url: '/api/tokens', headers: { 'x-test-user-id': owner.userId } });
    expect(listing.json()[0]).toMatchObject({ id: tokenId, revision: 1 }); expect(listing.body).not.toContain('tokenHash');
    const credential = await getCredential(db, owner, tokenId); expect(credential.revision).toBe(1); expect(credential.lastUsedAt).not.toBeNull();
    await call('list_projects', {}); expect((await getCredential(db, owner, tokenId)).lastUsedAt).toEqual(credential.lastUsedAt);
    const stale = await edit('rotate', tokenId, 9, 'rotate-conflict'); expect(stale.statusCode).toBe(409);
    const rotatedResponse = await edit('rotate', tokenId, 1, 'rotate'); expect(rotatedResponse.statusCode).toBe(200);
    const rotated = rotatedResponse.json(); secrets.push(rotated.plaintext);
    expect((await edit('rotate', tokenId, 1, 'rotate')).json().plaintext).toBeNull();
    expect((await edit('rotate', tokenId, 1, 'stale-revoked-rotate')).statusCode).toBe(409);
    expect((await edit('rotate', tokenId, 2, 'revoked-rotate')).statusCode).toBe(400);
    const old = await app.inject({ url: '/mcp', headers: { authorization: `Bearer ${plaintext}` } }); expect(old.statusCode).toBe(401);
    const replacement = await connect(rotated.plaintext); expect((await call('list_projects', {}, replacement)).items).toHaveLength(1);
    expect((await edit('revoke', rotated.token.id, 1, 'revoke')).statusCode).toBe(200);
    const revoked = await app.inject({ url: '/mcp', headers: { authorization: `Bearer ${rotated.plaintext}` } }); expect(revoked.statusCode).toBe(401);
    expect(revoked.headers['www-authenticate']).toContain('error="invalid_token"');
    expect(revoked.headers['www-authenticate']).toContain('Token missing, revoked or mistyped; create a new one in Settings -> MCP tokens.');
    expect(String(revoked.headers['www-authenticate'])).not.toContain(rotated.plaintext.slice(-8));
    expect(revoked.body).not.toContain(rotated.plaintext.slice(-8));
  });
  it('keeps a valid bearer at 200 and protected-resource metadata byte-identical', async () => {
    const issued = await issue('p2c-valid');
    const healthy = await app.inject({
      method: 'POST', url: '/mcp',
      headers: { authorization: `Bearer ${issued.plaintext}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      payload: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'p2c', version: '1' } } },
    });
    expect(healthy.statusCode).toBe(200);
    const metadata = await app.inject('/.well-known/oauth-protected-resource');
    expect(metadata.statusCode).toBe(200);
    expect(metadata.body).toBe('{"resource":"https://tracker.example/mcp","bearer_methods_supported":["header"],"resource_name":"Supa Agent Tracker"}');
    const suffix = `sat_${'c'.repeat(35)}QQQQ9P2C`;
    const queried = await app.inject(`/mcp?access_token=${suffix}`);
    expect(queried.statusCode).toBe(401);
    expect(String(queried.headers['www-authenticate'])).not.toContain('QQQQ9P2C');
    expect(queried.body).not.toContain('QQQQ9P2C');
  });
  it('serves protected-resource metadata on the RFC 9728 mcp path and 404s other well-known lookups', async () => {
    const root = await app.inject('/.well-known/oauth-protected-resource');
    const nested = await app.inject('/.well-known/oauth-protected-resource/mcp');
    expect(nested.statusCode).toBe(200);
    expect(nested.headers['content-type']).toContain('application/json');
    expect(nested.headers['cache-control']).toBe('no-store');
    expect(nested.body).toBe(root.body);
    expect(root.headers['cache-control']).toBe('no-store');
    for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration', '/.well-known/oauth-protected-resource/extra']) {
      const response = await app.inject(path);
      expect(response.statusCode, path).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
      expect(response.body).not.toContain('<html');
    }
    const bad = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: 'Bearer bogus-token' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.headers['www-authenticate']).toBe('Bearer resource_metadata="https://tracker.example/.well-known/oauth-protected-resource", error="invalid_token", error_description="Token missing, revoked or mistyped; create a new one in Settings -> MCP tokens."');
  });
  it('rejects browser Origins, query credentials, malformed or missing bearers before dispatch', async () => {
    for (const origin of ['https://evil.example', 'null', '']) {
      expect((await app.inject({ url: '/mcp', headers: { origin } })).statusCode).toBe(403);
    }
    const missing = await app.inject('/mcp'); expect(missing.statusCode).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer resource_metadata="https://tracker.example/.well-known/oauth-protected-resource", error_description="Supa Agent Tracker uses bearer tokens; add Authorization: Bearer <token> (Settings -> MCP tokens). OAuth sign-in is not available."');
    expect(missing.headers['www-authenticate']).not.toContain('error="invalid_token"');
    for (const authorization of ['Bearer invalid', 'Basic invalid', 'Bearer stub:mcp-owner']) {
      const result = await app.inject({ url: '/mcp', headers: { authorization } }); expect(result.statusCode).toBe(401); expect(result.headers['www-authenticate']).toContain('error="invalid_token"');
    }
    expect((await app.inject(`/mcp?access_token=${plaintext}`)).statusCode).toBe(401);
    expect((await app.inject(`/.well-known/oauth-protected-resource?access_token=${plaintext}`)).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/tokens?access_token=${plaintext}`, headers: { 'x-test-user-id': owner.userId } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/tokens', payload: { label: 'x', project_ids: [x.id], request_id: 'unauth' } })).statusCode).toBe(401);
  });
  it('limits each credential independently with HTTP 429 and rate_limited', async () => {
    const issued = await issue('limiter');
    for (let i = 0; i < CREDENTIAL_REQUESTS_PER_MINUTE; i++) {
      expect((await app.inject({ url: '/mcp', headers: { authorization: `Bearer ${issued.plaintext}` } })).statusCode).toBe(400);
    }
    const limited = await app.inject({ url: '/mcp', headers: { authorization: `Bearer ${issued.plaintext}` } });
    expect(limited.statusCode).toBe(429); expect(limited.json().error.code).toBe('rate_limited');
    const independent = await issue('independent');
    expect((await app.inject({ url: '/mcp', headers: { authorization: `Bearer ${independent.plaintext}` } })).statusCode).toBe(400);
  });
  it('permits empty-scope tokens while returning no projects and rejecting every mutation safely', async () => {
    const empty = await issue('empty-token', []); const c = await connect(empty.plaintext);
    expect((await call('list_projects', {}, c)).items).toEqual([]);
    expect((await call('get_project', { project_id: x.id }, c)).error.code).toBe('not_found');
    expect((await call('check_in', checkIn('empty-in'), c)).error.code).toBe('not_found');
    for (const name of ['update_status', 'heartbeat', 'check_out', 'record_tool_usage']) {
      const args = name === 'heartbeat' ? { run_id: parentId, request_id: `empty-${name}` }
        : name === 'record_tool_usage' ? { run_id: parentId, tools: [], request_id: `empty-${name}` }
        : name === 'check_out' ? { run_id: parentId, expected_revision: 1, execution_state: 'finished', work_status: 'completed', request_id: `empty-${name}` }
        : { run_id: parentId, expected_revision: 1, message: 'Denied', request_id: `empty-${name}` };
      expect((await call(name, args, c)).error.code).toBe('not_found');
    }
  });
  it('holds the 200-session limit across concurrent initialization and releases failed reservations', async () => {
    const bounded = Fastify({ logger: false });
    const pending: Promise<Response>[] = []; let release: () => void = () => undefined; let spy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await registerMcpRoutes(bounded, { pool, migrationsDir, spaRoot: '/unused', config: { publicUrl: 'http://localhost' } });
      const url = await bounded.listen({ port: 0, host: '127.0.0.1' });
      const tokens: string[] = [];
      for (let i = 0; i < 3; i++) {
        const issued = (await bounded.inject({ method: 'POST', url: '/api/tokens', headers: { 'x-test-user-id': owner.userId }, payload: { label: 'Capacity test', project_ids: [x.id], request_id: `capacity-token-${i}` } })).json();
        expect(issued.plaintext).toBeTruthy(); tokens.push(issued.plaintext); secrets.push(issued.plaintext);
      }
      const initialize = (token: string, accept = 'application/json, text/event-stream') => fetch(`${url}/mcp`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: accept },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'capacity-test', version: '1' } } }),
      });
      // Failed transport negotiation must not consume a slot.
      const failed = await initialize(tokens[2]!, 'application/json'); expect(failed.status).toBe(406); await failed.text();
      for (let i = 0; i < 199; i++) {
        const response = await initialize(tokens[Math.floor(i / 100)]!); expect(response.status).toBe(200); await response.json();
      }
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const original = McpServer.prototype.connect;
      spy = vi.spyOn(McpServer.prototype, 'connect').mockImplementation(async function (this: McpServer, ...args: Parameters<McpServer['connect']>) {
        await gate; return original.apply(this, args);
      });
      const first = initialize(tokens[2]!); pending.push(first);
      await vi.waitFor(() => expect(spy!.mock.calls.length).toBe(1));
      let secondFinished = false;
      const second = initialize(tokens[2]!).then((response) => { secondFinished = true; return response; }); pending.push(second);
      await vi.waitFor(() => expect(secondFinished || spy!.mock.calls.length === 2).toBe(true));
      release();
      const responses = await Promise.all(pending);
      const statuses = responses.map((response) => response.status).sort();
      await Promise.all(responses.map((response) => response.text()));
      expect(statuses).toEqual([200, 429]);
    } finally {
      release(); await Promise.allSettled(pending); spy?.mockRestore(); await bounded.close();
    }
  }, 30_000);
  it('never persists plaintext in any text/jsonb column or logs and excludes notes from every tool response', async () => {
    const tables = (await pool.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).rows as { table_name: string }[];
    for (const { table_name } of tables) {
      if (!/^[a-z_]+$/.test(table_name)) throw new Error('unsafe table');
      const rows = await pool.query(`select to_jsonb(t)::text body from "${table_name}" t`);
      for (const secret of secrets) for (const row of rows.rows) expect(row.body, table_name).not.toContain(secret);
    }
    for (const secret of secrets) expect(logs.join('')).not.toContain(secret);
    expect(JSON.stringify(responses)).not.toContain(note);
    expect(logs.join('')).not.toContain(note);
  });
  it('sends nosniff on a bad MCP token, a real initialize, and protected-resource metadata', async () => {
    const denied = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: 'Bearer bogus-token' } });
    expect(denied.statusCode).toBe(401);
    expect(denied.headers['x-content-type-options']).toBe('nosniff');

    const metadata = await app.inject('/.well-known/oauth-protected-resource');
    expect(metadata.statusCode).toBe(200);
    expect(metadata.headers['x-content-type-options']).toBe('nosniff');

    const issued = await issue('nosniff-init');
    const raw = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${issued.plaintext}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'nosniff', version: '1' } } }),
    });
    expect(raw.status).toBe(200);
    expect(raw.headers.get('x-content-type-options')).toBe('nosniff');
    const session = raw.headers.get('mcp-session-id');
    await raw.text();
    if (session) {
      await fetch(`${base}/mcp`, { method: 'DELETE', headers: { Authorization: `Bearer ${issued.plaintext}`, 'mcp-session-id': session } });
    }
  });
});
