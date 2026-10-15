// Local-only SDK check. The generated credential never leaves this process.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startProbe } from './server.mjs';

const token = randomBytes(32).toString('hex');
const probe = await startProbe({ port: 0, token, logger: () => {} });
const client = new Client({ name: 'p1-a1-local-live-check', version: '1.0.0' });
try {
  const denied = await fetch(`${probe.url}/mcp`);
  assert.equal(denied.status, 401);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${probe.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  assert.equal((await client.listTools()).tools.length, 3);
  const call = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);
  const who = await call('probe_whoami', {});
  assert.equal(who.auth.valid, true);
  const check = await call('probe_check_in', { project_id: 'synthetic', agent_name: 'sdk-live', title: 'Local live check', workload_type: 'automation', harness: 'official-sdk-client', model: 'unknown' });
  const beat = await call('probe_heartbeat', { run_id: check.run_id });
  assert.equal(beat.run_id, check.run_id);
  const log = await (await fetch(`${probe.url}/probe/log`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.equal(JSON.stringify({ who, check, beat, log }).includes(token), false);
  console.log(JSON.stringify({ status: 'PASS', unauthorized: denied.status, tools: 3, protocolVersion: who.protocolVersion, clientInfo: who.clientInfo, transport: who.transport, auth: who.auth, logEntries: log.length, credential: '[REDACTED]' }));
} finally {
  await client.close();
  await probe.close();
  console.log('Client closed; probe server stopped.');
}
