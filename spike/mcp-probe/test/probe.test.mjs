import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startProbe } from '../server.mjs';

const payload = (result) => JSON.parse(result.content[0].text);
async function fixture(t, token = '') {
  const stdout = [];
  const probe = await startProbe({ port: 0, token, logger: (line) => stdout.push(line) });
  t.after(() => probe.close());
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const connect = async (extraHeaders = {}, identity = 'sdk-probe-test') => {
    const client = new Client({ name: identity, version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${probe.url}/mcp`), { requestInit: { headers: { ...headers, ...extraHeaders } } });
    t.after(() => client.close());
    await client.connect(transport);
    return { client, transport };
  };
  return { ...probe, stdout, headers, connect, log: async () => (await fetch(`${probe.url}/probe/log`, { headers })).json() };
}

test('SDK initialize, list and all three tools in authless mode', async (t) => {
  const p = await fixture(t);
  const { client } = await p.connect();
  assert.deepEqual((await client.listTools()).tools.map((x) => x.name).sort(), ['probe_check_in', 'probe_heartbeat', 'probe_whoami']);
  const who = payload(await client.callTool({ name: 'probe_whoami', arguments: {} }));
  assert.equal(who.clientInfo.name, 'sdk-probe-test');
  assert.equal(who.protocolVersion, '2025-11-25');
  assert.equal(who.transport, 'Streamable HTTP');
  assert.deepEqual(who.auth, { present: false, valid: null });
  const input = { project_id: 'synthetic', agent_name: 'test', title: 'Probe', workload_type: 'coding' };
  const check = payload(await client.callTool({ name: 'probe_check_in', arguments: input }));
  assert.match(check.run_id, /^probe_/);
  for (const [k, v] of Object.entries(input)) assert.equal(check[k], v);
  assert.equal(check.model, undefined);
  const heartbeat = payload(await client.callTool({ name: 'probe_heartbeat', arguments: { run_id: check.run_id } }));
  assert.equal(heartbeat.run_id, check.run_id);
  assert.ok(Number.isFinite(Date.parse(heartbeat.timestamp)));
  assert.deepEqual((await p.log()).filter((x) => x.tool.startsWith('probe_')).map((x) => x.tool), ['probe_whoami', 'probe_check_in', 'probe_heartbeat']);
});

test('token is required on every endpoint and SDK request; RFC bearer challenge', async (t) => {
  const token = randomBytes(32).toString('hex');
  const p = await fixture(t, token);
  for (const path of ['/mcp', '/probe/log']) for (const authorization of [undefined, 'Bearer wrong']) {
    const response = await fetch(`${p.url}${path}`, { headers: authorization ? { Authorization: authorization } : {} });
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate'), /^Bearer resource_metadata="http:/);
    if (authorization) assert.match(response.headers.get('www-authenticate'), /error="invalid_token"/);
  }
  const denied = new Client({ name: 'unauthenticated', version: '1' });
  t.after(() => denied.close());
  await assert.rejects(denied.connect(new StreamableHTTPClientTransport(new URL(`${p.url}/mcp`))), /invalid_token/);
  const { client, transport } = await p.connect();
  const result = payload(await client.callTool({ name: 'probe_whoami', arguments: {} }));
  assert.deepEqual(result.auth, { present: true, valid: true });
  assert.equal(result.headers.authorization, '[REDACTED]');
  const noAuth = await fetch(`${p.url}/mcp`, { method: 'POST', headers: { 'mcp-session-id': transport.sessionId, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list' }) });
  assert.equal(noAuth.status, 401);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(JSON.stringify(await p.log()).includes(token), false);
  assert.equal(p.stdout.join('').includes(token), false);
});

test('secrets in arbitrary headers, clientInfo, arguments and errors never escape', async (t) => {
  const token = randomBytes(32).toString('hex');
  const p = await fixture(t, token);
  const { client } = await p.connect({ Cookie: 'private-cookie', 'x-api-key': 'private-api-key', 'User-Agent': token }, `client-${token}`);
  const who = payload(await client.callTool({ name: 'probe_whoami', arguments: {} }));
  assert.equal(who.headers.cookie, '[REDACTED]');
  assert.equal(who.headers['x-api-key'], '[REDACTED]');
  const check = await client.callTool({ name: 'probe_check_in', arguments: { project_id: 'test', agent_name: 'test', title: token, workload_type: 'automation', harness: token, model: token } });
  assert.equal(JSON.stringify(check).includes(token), false);
  const bad = await client.callTool({ name: 'probe_heartbeat', arguments: { run_id: token.repeat(10) } });
  assert.equal(bad.isError, true);
  assert.equal(JSON.stringify(bad).includes(token), false);
  for (const data of [who, await p.log(), p.stdout]) {
    assert.equal(JSON.stringify(data).includes(token), false);
    assert.equal(JSON.stringify(data).includes('private-cookie'), false);
    assert.equal(JSON.stringify(data).includes('private-api-key'), false);
  }
});

test('bounded 200-entry log omits tool arguments', async (t) => {
  const p = await fixture(t);
  const { client } = await p.connect();
  for (let i = 0; i < 205; i++) await client.callTool({ name: 'probe_heartbeat', arguments: { run_id: 'argument-not-logged' } });
  const log = await p.log();
  assert.equal(log.length, 200);
  assert.equal(log.every((x) => x.tool === 'probe_heartbeat'), true);
  assert.equal(JSON.stringify(log).includes('argument-not-logged'), false);
});

test('discovery is public, recorded and explicitly stops before OAuth; health and origin guard', async (t) => {
  const p = await fixture(t, randomBytes(32).toString('hex'));
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    const r = await fetch(`${p.url}${path}`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).resource, `${p.url}/mcp`);
  }
  assert.equal((await fetch(`${p.url}/.well-known/oauth-authorization-server`)).status, 501);
  assert.ok((await p.log()).some((x) => x.tool === 'discovery:authorization-server-unimplemented'));
  assert.equal((await fetch(`${p.url}/health`)).status, 200);
  assert.equal((await fetch(`${p.url}/mcp`, { headers: { ...p.headers, Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${p.url}/sse`)).status, 404);
});

test('parallel sessions and requests preserve client and authorization observations', async (t) => {
  const p = await fixture(t);
  const a = await p.connect({ Authorization: 'Bearer not-validated' }, 'alpha');
  const b = await p.connect({}, 'beta');
  const [wa, wb] = await Promise.all([a, b].map(async ({ client }) => payload(await client.callTool({ name: 'probe_whoami', arguments: {} }))));
  assert.equal(wa.clientInfo.name, 'alpha'); assert.equal(wb.clientInfo.name, 'beta');
  assert.equal(wa.auth.present, true); assert.equal(wb.auth.present, false);
  assert.equal(wa.auth.valid, null);
});

test('malformed, oversized, invalid tool input and expired session requests fail safely', async (t) => {
  const p = await fixture(t);
  const post = (body, headers = {}) => fetch(`${p.url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  assert.equal((await post('{')).status, 400);
  assert.equal((await post('x'.repeat(65 * 1024))).status, 413);
  assert.equal((await post('{}', { 'mcp-session-id': 'missing-session' })).status, 404);
  const { client, transport } = await p.connect();
  const invalid = await client.callTool({ name: 'probe_check_in', arguments: { project_id: 'test' } });
  assert.equal(invalid.isError, true);
  const id = transport.sessionId;
  await transport.terminateSession();
  assert.equal((await post('{}', { 'mcp-session-id': id })).status, 404);
});

test('authenticated check-in and heartbeat echo only synthetic fields', async (t) => {
  const p = await fixture(t, randomBytes(32).toString('hex'));
  const { client } = await p.connect();
  const input = { project_id: 'synthetic', agent_name: 'authenticated', title: 'Check', workload_type: 'automation', harness: 'sdk', model: 'known-test-model' };
  const check = payload(await client.callTool({ name: 'probe_check_in', arguments: input }));
  assert.deepEqual(Object.fromEntries(Object.keys(input).map((key) => [key, check[key]])), input);
  const beat = payload(await client.callTool({ name: 'probe_heartbeat', arguments: { run_id: check.run_id } }));
  assert.equal(beat.run_id, check.run_id);
  assert.ok(Number.isFinite(Date.parse(beat.timestamp)));
});
