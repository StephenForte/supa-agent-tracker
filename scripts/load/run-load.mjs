/* global AbortSignal, URL, clearInterval, console, fetch, setInterval */
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

const toolNames = ['check_in', 'heartbeat', 'update_status', 'create_next_step', 'check_out'];
const toolNameSet = new Set(toolNames);

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

function positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    console.error(`${name} must be a positive integer`);
    process.exit(1);
  }
  return Number(raw);
}

const mcpUrl = required('LOAD_MCP_URL');
const tokenA = required('LOAD_TOKEN_A');
const tokenB = required('LOAD_TOKEN_B');
const projectA = required('LOAD_PROJECT_A');
const projectB = required('LOAD_PROJECT_B');
const runs = positiveInt('LOAD_RUNS', 25);
const minutes = positiveInt('LOAD_MINUTES', 10);

const latencies = new Map(toolNames.map((name) => [name, []]));
const errors = Object.create(null);
let sessionsOpened = 0;
let requests = 0;

function record(label, elapsed, code) {
  requests += 1;
  if (toolNameSet.has(label)) latencies.get(label).push(elapsed);
  if (code) errors[code] = (errors[code] ?? 0) + 1;
}

function containsToken(text) {
  return text.includes(tokenA) || text.includes(tokenB);
}

async function rpc(state, method, params, label) {
  const id = method.startsWith('notifications/') ? undefined : state.nextId++;
  const message = {
    jsonrpc: '2.0',
    method,
    ...(id === undefined ? {} : { id }),
    ...(params === undefined ? {} : { params }),
  };
  const headers = {
    Authorization: `Bearer ${state.token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'User-Agent': 'supa-load/1',
  };
  if (state.sessionId) headers['mcp-session-id'] = state.sessionId;
  const started = performance.now();
  let response;
  try {
    response = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const code = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
    record(label, performance.now() - started, code);
    return { ok: false, code, payload: null };
  }
  const sessionId = response.headers.get('mcp-session-id');
  if (sessionId) state.sessionId = sessionId;
  const text = await response.text();
  const elapsed = performance.now() - started;
  if (response.status === 429) {
    record(label, elapsed, '429');
    return { ok: false, code: '429', payload: null };
  }
  if (response.status >= 400) {
    let code = `http_${response.status}`;
    try {
      const body = JSON.parse(text);
      if (typeof body?.error?.code === 'string') code = body.error.code;
    } catch {
      // Keep the HTTP status code when the body is not JSON.
    }
    record(label, elapsed, code);
    return { ok: false, code, payload: null };
  }
  if (label === 'initialize' || label === 'initialized' || text.length === 0) {
    record(label, elapsed, null);
    return { ok: true, code: null, payload: null };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    record(label, elapsed, 'bad_json');
    return { ok: false, code: 'bad_json', payload: null };
  }
  if (body.error) {
    const code = `jsonrpc_${body.error.code ?? 'error'}`;
    record(label, elapsed, code);
    return { ok: false, code, payload: body };
  }
  const result = body.result;
  if (!result) {
    record(label, elapsed, 'no_result');
    return { ok: false, code: 'no_result', payload: null };
  }
  let payload;
  try {
    payload = JSON.parse(result.content?.[0]?.text ?? 'null');
  } catch {
    record(label, elapsed, 'bad_tool_json');
    return { ok: false, code: 'bad_tool_json', payload: null };
  }
  if (result.isError) {
    const code = typeof payload?.error?.code === 'string' ? payload.error.code : 'tool_error';
    record(label, elapsed, code);
    return { ok: false, code, payload };
  }
  record(label, elapsed, null);
  return { ok: true, code: null, payload };
}

function revisionFrom(result, current) {
  if (typeof result.payload?.revision === 'number') return result.payload.revision;
  const currentRevision = result.payload?.error?.details?.current?.revision;
  if (typeof currentRevision === 'number') return currentRevision;
  return current;
}

function requestId(index, kind) {
  return `load-${index}-${kind}-${randomUUID()}`;
}

async function runAgent(index, token, projectId, deadline) {
  const state = { token, sessionId: null, nextId: 1 };
  const opened = await rpc(state, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'supa-load', version: '1' },
  }, 'initialize');
  if (!opened.ok || !state.sessionId) return false;
  sessionsOpened += 1;
  const ready = await rpc(state, 'notifications/initialized', undefined, 'initialized');
  if (!ready.ok) return false;

  const checkedIn = await rpc(state, 'tools/call', {
    name: 'check_in',
    arguments: {
      project_id: projectId,
      agent_name: `load-${index}`,
      title: `Load run ${index}`,
      workload_type: 'automation',
      request_id: requestId(index, 'in'),
    },
  }, 'check_in');
  if (!checkedIn.ok || typeof checkedIn.payload?.run_id !== 'string') return false;
  const runId = checkedIn.payload.run_id;
  let revision = revisionFrom(checkedIn, 1);

  await rpc(state, 'tools/call', {
    name: 'create_next_step',
    arguments: {
      project_id: projectId,
      source_run_id: runId,
      instruction: `Follow up from load run ${index}`,
      request_id: requestId(index, 'step'),
    },
  }, 'create_next_step');

  let nextHeartbeat = Date.now() + 30_000;
  let nextStatus = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const wait = Math.min(nextHeartbeat, nextStatus, deadline) - Date.now();
    if (wait > 0) await sleep(wait);
    if (Date.now() >= deadline) break;
    if (Date.now() >= nextHeartbeat) {
      const beat = await rpc(state, 'tools/call', {
        name: 'heartbeat',
        arguments: { run_id: runId, request_id: requestId(index, 'hb') },
      }, 'heartbeat');
      revision = revisionFrom(beat, revision);
      nextHeartbeat = Date.now() + 30_000;
    }
    if (Date.now() < deadline && Date.now() >= nextStatus) {
      const status = await rpc(state, 'tools/call', {
        name: 'update_status',
        arguments: {
          run_id: runId,
          expected_revision: revision,
          work_status: 'in_progress',
          message: 'Load status',
          request_id: requestId(index, 'st'),
        },
      }, 'update_status');
      revision = revisionFrom(status, revision);
      nextStatus = Date.now() + 120_000;
    }
  }

  const finished = await rpc(state, 'tools/call', {
    name: 'check_out',
    arguments: {
      run_id: runId,
      expected_revision: revision,
      execution_state: 'finished',
      work_status: 'completed',
      request_id: requestId(index, 'out'),
    },
  }, 'check_out');
  return finished.ok && finished.payload?.run_id === runId;
}

function ms(value) {
  return value === 'n/a' ? 'n/a' : `${value}ms`;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 'n/a';
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return String(Math.round(sorted[index]));
}

function renderReport(checkedOut) {
  const lines = [
    `runs: ${runs}`,
    `minutes: ${minutes}`,
    `sessions_opened: ${sessionsOpened}`,
    `checked_out: ${checkedOut}/${runs}`,
    `all_checked_out: ${checkedOut === runs ? 'yes' : 'no'}`,
    'tools:',
  ];
  let slowest = null;
  for (const name of toolNames) {
    const sorted = [...latencies.get(name)].sort((left, right) => left - right);
    const p95 = sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1))];
    if (p95 !== null && (slowest === null || p95 > slowest.p95)) slowest = { name, p95 };
    const max = sorted.length === 0 ? 'n/a' : `${Math.round(sorted[sorted.length - 1])}ms`;
    lines.push(`  ${name}: count=${sorted.length} p50=${ms(percentile(sorted, 50))} p95=${ms(percentile(sorted, 95))} max=${max}`);
  }
  lines.push('errors:');
  const codes = Object.keys(errors).sort();
  if (codes.length === 0) lines.push('  none');
  for (const code of codes) lines.push(`  ${code}: ${errors[code]}`);
  lines.push(`http_429: ${errors['429'] ?? 0}`);
  lines.push(`conflict: ${errors.conflict ?? 0}`);
  if (slowest && slowest.p95 > 500) {
    lines.push(`p95_over_500ms: ${slowest.name} ${Math.round(slowest.p95)}ms`);
  }
  return lines.join('\n');
}

const target = new URL(mcpUrl);
target.username = '';
target.password = '';
target.search = '';
console.error(`starting runs=${runs} minutes=${minutes} target=${target.origin}${target.pathname}`);

const started = Date.now();
const deadline = started + minutes * 60_000;
const progress = setInterval(() => {
  const elapsed = Math.round((Date.now() - started) / 1000);
  const errorCount = Object.values(errors).reduce((sum, count) => sum + count, 0);
  console.error(`progress seconds=${elapsed} requests=${requests} errors=${errorCount}`);
}, 60_000);

const countA = Math.ceil(runs / 2);
const agents = Array.from({ length: runs }, (_, index) => ({
  index,
  token: index < countA ? tokenA : tokenB,
  projectId: index < countA ? projectA : projectB,
}));

const outcomes = await Promise.all(agents.map(async (agent) => {
  try {
    return await runAgent(agent.index, agent.token, agent.projectId, deadline);
  } catch (error) {
    errors.uncaught = (errors.uncaught ?? 0) + 1;
    const name = error instanceof Error ? error.name : 'error';
    console.error(`agent ${agent.index} stopped: ${name}`);
    return false;
  }
}));
clearInterval(progress);
const report = renderReport(outcomes.filter(Boolean).length);
if (containsToken(report)) {
  console.error('Refusing to print output that contains a token');
  process.exit(1);
}
console.log(report);
