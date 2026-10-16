#!/usr/bin/env node
import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

// Fixed messages only: never log env values, exception messages or server bodies.
let finished = false;
let lock;
function releaseLock() {
  const owned = lock; lock = undefined;
  if (owned) { try { unlinkSync(owned); } catch { /* Explicit local cleanup may be needed. */ } }
}
function finish(status) {
  if (!finished) { finished = true; process.stderr.write(`supa heartbeat: ${status}\n`); }
  releaseLock();
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => finish('interrupted'));
const deadline = setTimeout(() => finish('timed out'), 10000);
const signal = AbortSignal.timeout(9000);
let session;
let headers;
let endpoint;
let status;
try {
  const file = resolve(process.env.SUPA_RUN_ID_FILE || '.supa/run-id');
  let runId;
  try { runId = readFileSync(file, 'utf8').trim(); } catch { finish('no run'); }
  if (!runId) finish('no run');
  if (runId.length > 128 || /\s/.test(runId)) finish('invalid run');
  const url = new URL(process.env.SUPA_MCP_URL || '');
  // Never transmit credentials over non-loopback plaintext or follow redirects.
  if (url.username || url.password || url.hash || !(['https:'].includes(url.protocol)
    || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) finish('invalid configuration');
  const token = process.env.SUPA_MCP_TOKEN;
  if (!token) finish('missing configuration');
  endpoint = url.href;
  const stamp = `${file}.${createHash('sha256').update(runId).digest('hex')}.heartbeat`;
  const lockPath = `${stamp}.lock`;
  // Reclaim crash/SIGKILL leftovers well past the ten-second process deadline.
  // Duplicate heartbeats are harmless; fresh locks still serialize concurrent hooks.
  try { if (Date.now() - statSync(lockPath).mtimeMs > 30000) unlinkSync(lockPath); }
  catch { /* A missing lock is normal; exclusive creation below still fails closed. */ }
  try { closeSync(openSync(lockPath, 'wx', 0o600)); lock = lockPath; }
  catch { finish('throttled'); }
  let previous = 0;
  try { previous = Number(readFileSync(stamp, 'utf8')); } catch { /* First attempt. */ }
  if (Date.now() - previous < 60000) { status = 'throttled'; }
  else {
    // Reserve before sending; even failed attempts are limited to one per minute.
    writeFileSync(stamp, String(Date.now()), { mode: 0o600 });
    headers = { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
    async function post(method, params, id) {
      const response = await fetch(endpoint, { method: 'POST', headers, signal, redirect: 'error',
        body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }) });
      if (method === 'initialize') {
        session = response.headers.get('mcp-session-id');
        if (session) headers['mcp-session-id'] = session;
      }
      if (!response.ok) throw new Error('request failed');
      if (id === undefined) { await response.body?.cancel(); return; }
      const body = await response.json();
      if (body.error || !body.result) throw new Error('protocol failed');
      return body.result;
    }
    await post('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'supa-heartbeat', version: '1.0.0' } }, 1);
    if (!session) throw new Error('missing session');
    headers['mcp-protocol-version'] = '2025-11-25';
    await post('notifications/initialized', {});
    const result = await post('tools/call', { name: 'heartbeat', arguments: { run_id: runId, request_id: randomUUID() } }, 2);
    if (result.isError) throw new Error('heartbeat rejected');
    status = 'sent';
  }
} catch { status = 'unavailable'; }
finally {
  if (session) {
    try {
      const response = await fetch(endpoint, { method: 'DELETE', headers, signal, redirect: 'error' });
      await response.body?.cancel();
    } catch { /* Best effort within the same overall deadline. */ }
  }
  releaseLock();
}
clearTimeout(deadline);
finish(status);
