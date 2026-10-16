import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { buildApp } from '../app/build-app.js';
import { createDb } from '../db/client.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { users } from '../db/schema.js';
import { migrationsDir } from '../paths.js';
import { createProject } from '../repo/projects.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { CURSOR_HOOK_EXAMPLE, integrationExamples } from '../../src/domain/integrations/examples.js';

const exec = promisify(execFile);
let scratch: ScratchDatabase; let pool: pg.Pool; let app: FastifyInstance;
let client: Client; let base: string; let token: string; let projectId: string; let temp: string;
let requests = 0;
const adapter = new URL('../../adapters/heartbeat/heartbeat.mjs', import.meta.url).pathname;
async function spawn(file: string, credential = token, url = `${base}/mcp`) {
  return exec(process.execPath, [adapter], { cwd: temp, timeout: 12000, env: {
    ...process.env, SUPA_MCP_URL: url, SUPA_MCP_TOKEN: credential, SUPA_RUN_ID_FILE: file,
  } });
}
async function tool<T>(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  return JSON.parse((result.content as { text: string }[])[0]!.text) as T;
}
async function run(label: string) {
  const checked = await tool<{ run_id: string; revision: number }>('check_in', { project_id: projectId,
    agent_name: label, title: label, workload_type: 'automation', request_id: crypto.randomUUID() });
  const folder = join(temp, label, '.supa'); await mkdir(folder, { recursive: true });
  const file = join(folder, 'run-id'); await writeFile(file, checked.run_id);
  return { ...checked, file };
}
async function snapshot(runId: string) {
  const row = (await pool.query('select revision, execution_state from runs where id=$1', [runId])).rows[0];
  const events = (await pool.query("select count(*)::int n from run_events where run_id=$1 and kind='heartbeat'", [runId])).rows[0].n;
  return { ...row, events };
}

describe('heartbeat adapter against the real MCP server', () => {
  beforeAll(async () => {
    temp = await mkdtemp(join(tmpdir(), 'supa-p1-f-adapter-'));
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString);
    await runMigrations(pool, migrationsDir);
    const db = createDb(pool); const owner = { kind: 'user' as const, userId: 'adapter-owner' };
    await db.insert(users).values({ id: owner.userId, email: 'adapter@example.com' });
    projectId = (await createProject(db, owner, { name: 'Adapter', type: 'automation' })).id;
    app = await buildApp({ config: { databaseUrl: scratch.connectionString, publicUrl: 'http://localhost:3000',
      nodeEnv: 'test', port: 0, migrateOnBoot: false }, pool, migrationsDir,
      spaRoot: new URL('../../dist', import.meta.url).pathname, logger: false });
    app.addHook('onRequest', async request => { if (request.url === '/mcp') requests++; });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
    const issued = await app.inject({ method: 'POST', url: '/api/tokens', headers: { 'x-test-user-id': owner.userId },
      payload: { label: 'Adapter', project_ids: [projectId], request_id: crypto.randomUUID() } });
    expect(issued.statusCode).toBe(200); token = issued.json().plaintext;
    client = new Client({ name: 'adapter-tests', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  });
  afterAll(async () => {
    await client?.close(); await app?.close(); await pool?.end(); await scratch?.drop();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  it('sends one event without revision churn, closes its session and throttles the next spawn', async () => {
    const checked = await run('flow'); const before = requests;
    expect(await spawn(checked.file)).toMatchObject({ stdout: '', stderr: 'supa heartbeat: sent\n' });
    expect(await snapshot(checked.run_id)).toMatchObject({ revision: checked.revision, events: 1 });
    expect(requests - before).toBe(4); // initialize, initialized, tools/call, DELETE
    const after = requests;
    expect(await spawn(checked.file)).toMatchObject({ stdout: '', stderr: 'supa heartbeat: throttled\n' });
    expect(requests).toBe(after);
    expect((await snapshot(checked.run_id)).events).toBe(1);
  });

  it('makes no request when run file is missing or empty', async () => {
    const before = requests;
    const file = join(temp, 'missing');
    expect((await spawn(file)).stderr).toBe('supa heartbeat: no run\n');
    await writeFile(file, ' \n');
    expect((await spawn(file)).stderr).toBe('supa heartbeat: no run\n');
    expect(requests).toBe(before);
  });

  it('redacts wrong tokens and URL queries without recording an event', async () => {
    const checked = await run('wrong-token'); const wrong = 'WRONG-TOKEN-PRIVATE-2c1';
    const output = await spawn(checked.file, wrong, `${base}/mcp?private=QUERY-PRIVATE-98`);
    expect(output.stderr).toBe('supa heartbeat: unavailable\n');
    expect(output.stdout).toBe(''); expect(JSON.stringify(output)).not.toContain(wrong);
    expect(JSON.stringify(output)).not.toContain('QUERY-PRIVATE-98');
    expect((await snapshot(checked.run_id)).events).toBe(0);
  });

  it('does not reopen an ended run', async () => {
    const checked = await run('ended');
    await tool('check_out', { run_id: checked.run_id, expected_revision: checked.revision,
      execution_state: 'finished', work_status: 'completed', request_id: crypto.randomUUID() });
    const before = await snapshot(checked.run_id);
    expect((await spawn(checked.file)).stderr).toBe('supa heartbeat: unavailable\n');
    expect(await snapshot(checked.run_id)).toEqual(before);
    expect(before.execution_state).toBe('finished');
  });

  it('serializes concurrent hooks and treats a new run in the same file separately', async () => {
    const first = await run('concurrent');
    const outputs = await Promise.all(Array.from({ length: 4 }, () => spawn(first.file)));
    expect(outputs.filter(output => output.stderr === 'supa heartbeat: sent\n')).toHaveLength(1);
    expect((await snapshot(first.run_id)).events).toBe(1);
    const second = await run('next-run'); await writeFile(first.file, second.run_id);
    expect((await spawn(first.file)).stderr).toBe('supa heartbeat: sent\n');
    expect((await snapshot(second.run_id)).events).toBe(1);
  });

  it('caps a stalled server at ten seconds with a successful process exit', async () => {
    const checked = await run('timeout');
    const stalled = createServer(() => { /* Deliberately never respond. */ });
    stalled.listen(0, '127.0.0.1'); await once(stalled, 'listening');
    const address = stalled.address(); if (!address || typeof address === 'string') throw new Error('No port');
    const start = Date.now();
    try {
      const result = await spawn(checked.file, token, `http://127.0.0.1:${address.port}/mcp`);
      expect(result.stdout).toBe(''); expect(result.stderr).toMatch(/^supa heartbeat: (unavailable|timed out)\n$/);
      expect(Date.now() - start).toBeLessThan(11000);
    } finally { stalled.closeAllConnections(); await new Promise<void>(resolve => stalled.close(() => resolve())); }
  }, 15000);

  it('checks every documented tool against live tools/list and all 12 in the protocol', async () => {
    const names = (await client.listTools()).tools.map(tool => tool.name);
    expect(names).toHaveLength(12);
    const protocol = await readFile(new URL('../../docs/integrations/reporting-protocol.md', import.meta.url), 'utf8');
    const promptDoc = await readFile(new URL('../../docs/integrations/base-prompt.md', import.meta.url), 'utf8');
    for (const doc of [protocol, promptDoc]) {
      const mentioned = doc.match(/\b(?:(?:list|get|check|update|create|reorder|set|record)_[a-z_]+|heartbeat)\b/g) ?? [];
      for (const name of mentioned) expect(names, name).toContain(name);
    }
    for (const name of names) expect(protocol).toContain('`' + name + '`');
    const prompt = promptDoc.match(/```text\n([\s\S]*?)\n```/)![1]!;
    expect(prompt.split(/\s+/).length).toBeLessThan(300);
    const source = await readFile(new URL('../../src/domain/integrations/agentContext.ts', import.meta.url), 'utf8');
    const literal = source.match(/export const BASE_INSTRUCTION_DRAFT = (.*);/)![1]!;
    expect(prompt).toBe(JSON.parse(literal));
    for (const example of integrationExamples()) {
      const guide = await readFile(new URL(`../../docs/integrations/${example.id}.md`, import.meta.url), 'utf8');
      expect(guide).toContain(example.verifiedLabel); expect(guide).toContain(example.example);
      for (const instruction of example.instructions) expect(guide).toContain(instruction);
      if (example.id === 'cursor') expect(guide).toContain(CURSOR_HOOK_EXAMPLE);
    }
  });
});
