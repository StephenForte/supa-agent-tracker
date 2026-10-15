import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Diagnostic service only: no disk writes, outgoing requests, or application data.
export async function startProbe({ token = process.env.PROBE_TOKEN || '', port = Number(process.env.PORT || 8787), host = '127.0.0.1', publicUrl = process.env.PROBE_PUBLIC_URL, logger = console.log } = {}) {
  const context = new AsyncLocalStorage();
  const sessions = new Map();
  const calls = [];
  let base;
  const scrub = (value) => {
    if (typeof value === 'string') return token ? value.split(token).join('[REDACTED]') : value;
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [scrub(k), scrub(v)]));
    return value;
  };
  const record = (event) => {
    const safe = scrub({ timestamp: new Date().toISOString(), ...event });
    calls.push(safe);
    if (calls.length > 200) calls.shift();
    // Only bounded, scrubbed metadata goes to stdout; never arguments or headers.
    logger(JSON.stringify(safe));
  };
  const auth = (req) => {
    const header = req.headers.authorization;
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(header || '');
    return { present: header !== undefined, valid: token ? actual.length === expected.length && timingSafeEqual(actual, expected) : null };
  };
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(scrub(body)));
  };
  const drop = async (id) => {
    const entry = sessions.get(id);
    sessions.delete(id);
    if (entry) await entry.server.close();
  };
  const textResult = (value) => ({ content: [{ type: 'text', text: JSON.stringify(scrub(value)) }] });
  const makeSession = async (body) => {
    const server = new McpServer({ name: 'supa-mcp-probe', version: '0.1.0' });
    const requested = body.params.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
    const observe = (tool) => {
      const current = context.getStore();
      record({ tool, clientInfo: server.server.getClientVersion(), auth: current.auth });
      return current;
    };
    server.registerTool('probe_whoami', { description: 'Observed MCP session metadata; credentials are redacted.', inputSchema: {} }, async () => {
      const current = observe('probe_whoami');
      return textResult({ protocolVersion, requestedProtocolVersion: requested, clientInfo: server.server.getClientVersion(), transport: 'Streamable HTTP', auth: current.auth, headers: current.headers });
    });
    const field = z.string().min(1).max(200);
    server.registerTool('probe_check_in', {
      description: 'Echo a synthetic check-in. Omit harness/model when unknown; never guess or send secrets.',
      inputSchema: { project_id: field, agent_name: field, title: field, workload_type: z.enum(['coding', 'automation']), harness: field.optional(), model: field.optional() },
    }, async (input) => { observe('probe_check_in'); return textResult({ ...input, run_id: `probe_${randomUUID()}` }); });
    server.registerTool('probe_heartbeat', { description: 'Return server receipt time for a synthetic run.', inputSchema: { run_id: field } }, async ({ run_id }) => {
      observe('probe_heartbeat'); return textResult({ run_id, timestamp: new Date().toISOString() });
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      enableJsonResponse: true,
      onsessioninitialized: (id) => { sessions.set(id, { server, transport, touched: Date.now() }); },
    });
    transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
    await server.connect(transport);
    return { server, transport };
  };
  const http = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const state = auth(req);
      // Deny browser-origin requests; these clients connect server-to-server.
      if (req.headers.origin) return json(res, 403, { error: 'origin_not_allowed' });
      if (path === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok' });
      if (req.method === 'GET' && ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(path)) {
        record({ tool: 'discovery:protected-resource', auth: state });
        return json(res, 200, { resource: `${base}/mcp`, authorization_servers: [base], bearer_methods_supported: ['header'] });
      }
      if (path === '/.well-known/oauth-authorization-server' && req.method === 'GET') {
        record({ tool: 'discovery:authorization-server-unimplemented', auth: state });
        return json(res, 501, { error: 'oauth_not_implemented', error_description: 'Probe records discovery only. No authorization server exists.' });
      }
      if (!['/mcp', '/probe/log'].includes(path)) return json(res, 404, { error: 'not_found' });
      if (token && !state.valid) {
        record({ tool: 'http:unauthorized', auth: state });
        return json(res, 401, { error: 'invalid_token' }, { 'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"${state.present ? ', error="invalid_token"' : ''}` });
      }
      if (path === '/probe/log') return req.method === 'GET' ? json(res, 200, calls) : json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
      // Bound active sessions as well as the diagnostic log. Reinitialize after expiry.
      for (const [id, entry] of sessions) if (Date.now() - entry.touched > 15 * 60_000) await drop(id);
      let entry = sessions.get(req.headers['mcp-session-id']);
      let body;
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 64 * 1024) { json(res, 413, { error: 'payload_too_large' }); req.resume(); return; }
          chunks.push(chunk);
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
        if (!entry && !req.headers['mcp-session-id'] && isInitializeRequest(body)) {
          if (sessions.size >= 50) return json(res, 503, { error: 'session_limit' });
          entry = await makeSession(body);
          record({ tool: 'initialize', clientInfo: body.params.clientInfo, auth: state });
        }
      }
      if (!entry) return json(res, req.headers['mcp-session-id'] ? 404 : 400, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Initialize a new session' } });
      entry.touched = Date.now();
      // Preserve non-sensitive transport headers, redact all other arbitrary values.
      const visible = new Set(['accept', 'content-type', 'mcp-protocol-version', 'user-agent']);
      const headers = Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, visible.has(key) ? value : '[REDACTED]']));
      await context.run({ auth: state, headers: scrub(headers) }, () => entry.transport.handleRequest(req, res, body));
    } catch {
      // SDK/HTTP errors may contain credentials: never print raw exceptions.
      if (!res.headersSent) json(res, 500, { error: 'probe_request_failed' });
      else res.end();
    }
  });
  await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, host, resolve); });
  base = publicUrl ? new URL(publicUrl).origin : `http://127.0.0.1:${http.address().port}`;
  return { url: base, async close() {
    await Promise.all([...sessions.keys()].map(drop));
    http.closeAllConnections();
    await new Promise((resolve, reject) => http.close((err) => err ? reject(err) : resolve()));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const probe = await startProbe({ host: '0.0.0.0' });
  console.log('MCP probe listening; credentials and request arguments are never printed.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await probe.close(); process.exit(0); });
}
