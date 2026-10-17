import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { createRun } from '../repo/runs.js';

const owner = { kind: 'user' as const, userId: 'all-owner' };
const other = { kind: 'user' as const, userId: 'all-other' };
let scratch: ScratchDatabase; let pool: pg.Pool; let db: AppDatabase; let app: FastifyInstance; let base: string;
let projectA: Project; let foreign: Project; let foreignRunId: string;
const clients: Client[] = []; const secrets: string[] = []; const logs: string[] = [];

async function connect(token: string) {
  const value = new Client({ name: 'all-projects-client', version: '1.0' });
  clients.push(value);
  await value.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return value;
}
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { text: string }[];
  return JSON.parse(content[0]!.text) as { error?: { code: string }; items?: { id: string; repositoryName?: string | null; repositoryUrl?: string | null; repository_name?: string }[]; run_id?: string };
}
function headers() { return { 'x-test-user-id': owner.userId }; }
function post(url: string, payload: { label?: string; project_ids?: string[]; all_projects?: boolean; request_id: string; expected_revision?: number }) {
  return app.inject({ method: 'POST', url, headers: headers(), payload });
}

describe('all-projects tokens over an open MCP session', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString); db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([{ id: owner.userId, email: 'all@example.com' }, { id: other.userId, email: 'all-other@example.com' }]);
    projectA = await createProject(db, owner, { name: 'Already mine', type: 'coding', repositoryName: 'owner/already', repositoryUrl: 'https://github.com/owner/already' });
    foreign = await createProject(db, other, { name: 'Not mine', type: 'automation', repositoryName: 'other/secret', repositoryUrl: 'https://github.com/other/secret' });
    const agent = await createAgent(db, other, foreign.id, { name: 'other-agent', title: 'Other', workloadType: 'automation' });
    foreignRunId = (await createRun(db, other, foreign.id, { agentId: agent.id, title: 'Foreign run', workloadType: 'automation' })).id;
    app = await buildApp({ config: { databaseUrl: scratch.connectionString, publicUrl: 'http://127.0.0.1:3000', nodeEnv: 'test', port: 0, migrateOnBoot: false },
      pool, migrationsDir, spaRoot: new URL('../../dist', import.meta.url).pathname, logger: createLoggerOptions({ write: (value) => logs.push(value) }) });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close())); await app?.close(); await pool?.end(); await scratch?.drop();
  });

  it('issues all-projects without grants, rejects a mixed scope, and does not widen an omitted flag', async () => {
    const mixed = await post('/api/tokens', { label: 'Mixed', project_ids: [projectA.id], all_projects: true, request_id: 'mixed-scope' });
    expect(mixed.statusCode).toBe(400);
    expect(mixed.json().error.code).toBe('validation_error');
    const issued = await post('/api/tokens', { label: 'Everything', project_ids: [], all_projects: true, request_id: 'issue-all' });
    expect(issued.statusCode).toBe(200);
    const body = issued.json();
    secrets.push(body.plaintext);
    expect(body.token).toMatchObject({ allProjects: true, projectIds: [], revision: 1 });
    expect((await pool.query('select count(*)::int n from mcp_credential_projects where credential_id = $1', [body.token.id])).rows[0].n).toBe(0);
    const specific = await post('/api/tokens', { label: 'Only A', project_ids: [projectA.id], request_id: 'issue-specific' });
    expect(specific.statusCode).toBe(200);
    secrets.push(specific.json().plaintext);
    expect(specific.json().token.allProjects).toBe(false);
    expect(specific.json().token.projectIds).toEqual([projectA.id]);
    const conflict = await post(`/api/tokens/${body.token.id}/scope`, { request_id: 'stale-scope', expected_revision: 99, all_projects: false, project_ids: [projectA.id] });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.details.current).toMatchObject({ allProjects: true, projectIds: [] });
  });

  it('sees and checks in to a project created after issuance on the next call of an open session, and never another owner', async () => {
    const issued = await post('/api/tokens', { label: 'Session', project_ids: [], all_projects: true, request_id: 'issue-session' });
    const plaintext = issued.json().plaintext as string; secrets.push(plaintext);
    const tokenId = issued.json().token.id as string;
    const specific = await post('/api/tokens', { label: 'Narrow forever', project_ids: [projectA.id], request_id: 'issue-narrow-forever' });
    const specificToken = specific.json().plaintext as string; secrets.push(specificToken);
    const client = await connect(plaintext);
    const later = await createProject(db, owner, { name: 'Created later', type: 'coding', repositoryName: 'StephenForte/supa-agent-tracker', repositoryUrl: 'https://github.com/StephenForte/supa-agent-tracker' });
    const listed = await call(client, 'list_projects', {});
    const ids = listed.items!.map((item) => item.id);
    expect(ids).toContain(later.id);
    expect(ids).toContain(projectA.id);
    expect(ids).not.toContain(foreign.id);
    const laterRow = listed.items!.find((item) => item.id === later.id)!;
    expect(laterRow.repositoryName).toBe('StephenForte/supa-agent-tracker');
    expect(laterRow.repositoryUrl).toBe('https://github.com/StephenForte/supa-agent-tracker');
    expect(laterRow.repository_name).toBeUndefined();
    const started = await call(client, 'check_in', { project_id: later.id, agent_name: 'worker', title: 'Later work', workload_type: 'coding', task_id: 'P1-J', request_id: 'later-checkin' });
    expect(started.run_id).toBeTruthy();
    expect(started.error).toBeUndefined();
    for (const project_id of [foreign.id]) {
      expect((await call(client, 'get_project', { project_id })).error?.code).toBe('not_found');
      expect((await call(client, 'check_in', { project_id, agent_name: 'worker', title: 'Nope', workload_type: 'automation', request_id: `foreign-${project_id}` })).error?.code).toBe('not_found');
    }
    expect((await call(client, 'update_status', { run_id: foreignRunId, expected_revision: 1, message: 'stolen', request_id: 'foreign-run' })).error?.code).toBe('not_found');
    expect((await call(client, 'check_in', { project_id: later.id, agent_name: 'child', title: 'Child', workload_type: 'automation', parent_run_id: foreignRunId, request_id: 'foreign-parent' })).error?.code).toBe('not_found');
    const specificClient = await connect(specificToken);
    expect((await call(specificClient, 'list_projects', {})).items!.map((item) => item.id)).toEqual([projectA.id]);
    expect((await call(specificClient, 'check_in', { project_id: later.id, agent_name: 'worker', title: 'Blocked', workload_type: 'coding', task_id: 'P1-J', request_id: 'specific-later' })).error?.code).toBe('not_found');

    const narrowed = await post(`/api/tokens/${tokenId}/scope`, { request_id: 'narrow-once', expected_revision: 1, all_projects: false, project_ids: [projectA.id] });
    expect(narrowed.statusCode).toBe(200);
    expect(narrowed.json().token).toMatchObject({ allProjects: false, projectIds: [projectA.id], revision: 2 });
    const replayed = await post(`/api/tokens/${tokenId}/scope`, { request_id: 'narrow-once', expected_revision: 1, all_projects: false, project_ids: [projectA.id] });
    expect(replayed.json()).toEqual(narrowed.json());
    const after = await call(client, 'list_projects', {});
    expect(after.items!.map((item) => item.id)).toEqual([projectA.id]);
    expect((await call(client, 'check_in', { project_id: later.id, agent_name: 'worker', title: 'Later work', workload_type: 'coding', task_id: 'P1-J', request_id: 'later-checkin' })).error?.code).toBe('forbidden');
    expect((await call(client, 'check_in', { project_id: later.id, agent_name: 'worker', title: 'Fresh', workload_type: 'coding', task_id: 'P1-J', request_id: 'later-fresh' })).error?.code).toBe('not_found');
  });

  it('keeps all_projects across rotation and ends access on revoke', async () => {
    const issued = await post('/api/tokens', { label: 'Rotate me', project_ids: [], all_projects: true, request_id: 'issue-rotate' });
    const plaintext = issued.json().plaintext as string; secrets.push(plaintext);
    const tokenId = issued.json().token.id as string;
    const rotated = await post(`/api/tokens/${tokenId}/rotate`, { request_id: 'rotate-all', expected_revision: 1 });
    expect(rotated.statusCode).toBe(200);
    const replacement = rotated.json();
    secrets.push(replacement.plaintext);
    expect(replacement.token.allProjects).toBe(true);
    expect(replacement.token.projectIds).toEqual([]);
    expect((await pool.query('select count(*)::int n from mcp_credential_projects where credential_id = $1', [replacement.token.id])).rows[0].n).toBe(0);
    expect((await app.inject({ url: '/mcp', headers: { authorization: `Bearer ${plaintext}` } })).statusCode).toBe(401);
    const born = await createProject(db, owner, { name: 'After rotate', type: 'automation' });
    const client = await connect(replacement.plaintext);
    expect((await call(client, 'list_projects', {})).items!.map((item) => item.id)).toContain(born.id);
    const revoked = await post(`/api/tokens/${replacement.token.id}/revoke`, { request_id: 'revoke-all', expected_revision: replacement.token.revision });
    expect(revoked.statusCode).toBe(200);
    expect((await app.inject({ url: '/mcp', headers: { authorization: `Bearer ${replacement.plaintext}` } })).statusCode).toBe(401);
    const edited = await post(`/api/tokens/${replacement.token.id}/scope`, { request_id: 'scope-revoked', expected_revision: replacement.token.revision + 1, all_projects: false, project_ids: [projectA.id] });
    expect(edited.statusCode).toBe(400);
    expect(edited.json().error.code).toBe('validation_error');
  });

  it('never stores plaintext in idempotency responses or logs', async () => {
    const rows = await pool.query<{ body: string }>('select response::text body from idempotency_keys');
    for (const secret of secrets) {
      for (const row of rows.rows) expect(row.body).not.toContain(secret);
      expect(logs.join('')).not.toContain(secret);
    }
  });
});
