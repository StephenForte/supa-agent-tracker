import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { RouteDeps } from '../app/routes.js';
import { requireMcpCredential } from '../app/auth-context.js';
import { apiError } from '../app/errors.js';
import { createDb } from '../db/client.js';
import { secretSafeLogger, bindCredentialDatabase } from '../tokens/auth.js';
import { registerTokenRoutes } from '../tokens/routes.js';
import { API_VERSION, registerRunTools } from './tools.js';
import { createToolRegistrar, type ToolContext } from './registry.js';

export const CREDENTIAL_REQUESTS_PER_MINUTE = 120;
const MAX_SESSIONS = 200;
const IDLE_MS = 15 * 60_000;
interface Session { server: McpServer; transport: StreamableHTTPServerTransport; credentialId: string; touched: number }

export async function registerMcpRoutes(app: FastifyInstance, deps: RouteDeps & { config?: { publicUrl: string } }): Promise<void> {
  const db = createDb(deps.pool);
  const origin = new URL(deps.config?.publicUrl ?? process.env.PUBLIC_URL ?? 'http://localhost:3000').origin;
  bindCredentialDatabase(app, db, origin);
  const context = new AsyncLocalStorage<ToolContext>();
  const sessions = new Map<string, Session>();
  const limits = new Map<string, { start: number; count: number }>();
  const drop = async (id: string) => { const entry = sessions.get(id); sessions.delete(id); await entry?.server.close(); };
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of sessions) if (now - entry.touched >= IDLE_MS) void drop(id);
    for (const [id, entry] of limits) if (now - entry.start >= 60_000) limits.delete(id);
  }, 60_000);
  timer.unref();
  app.addHook('onClose', async () => { clearInterval(timer); await Promise.all([...sessions.keys()].map(drop)); });
  app.get('/.well-known/oauth-protected-resource', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { resource: `${origin}/mcp`, bearer_methods_supported: ['header'], resource_name: 'Supa Agent Tracker' };
  });
  await registerTokenRoutes(app, db);
  app.route({ method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE'], url: '/mcp',
    // Query credentials and arbitrary metadata must not enter request logs.
    childLoggerFactory: secretSafeLogger,
    onRequest: async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (request.headers.origin !== undefined) return reply.code(403).send(apiError('forbidden', 'Origin is not allowed'));
    },
    preHandler: async (request, reply) => {
      await requireMcpCredential.call(app, request, reply);
      if (reply.sent) return;
      const credentialId = request.mcpCredential!.credentialId;
      const now = Date.now();
      let limit = limits.get(credentialId);
      if (!limit || now - limit.start >= 60_000) { limit = { start: now, count: 0 }; limits.set(credentialId, limit); }
      if (++limit.count > CREDENTIAL_REQUESTS_PER_MINUTE) return reply.header('Retry-After', '60').code(429).send(apiError('rate_limited', 'Credential request limit exceeded'));
    },
    handler: async (request, reply) => {
      const credential = request.mcpCredential!;
      let entry: Session | undefined;
      const sessionId = request.headers['mcp-session-id'];
      if (typeof sessionId === 'string') entry = sessions.get(sessionId);
      if (entry && (entry.credentialId !== credential.credentialId || Date.now() - entry.touched >= IDLE_MS)) {
        if (entry.credentialId === credential.credentialId) await drop(sessionId as string);
        entry = undefined;
      }
      if (!entry && sessionId !== undefined) return reply.code(404).send(apiError('not_found', 'Session not found'));
      if (!entry && request.method === 'POST' && isInitializeRequest(request.body)) {
        if (sessions.size >= MAX_SESSIONS) return reply.code(429).send(apiError('rate_limited', 'Session limit exceeded'));
        const info = { name: 'supa-agent-tracker', version: '1.0.0', api_version: API_VERSION, _meta: { api_version: API_VERSION } };
        const server = new McpServer(info);
        const register = createToolRegistrar(server, { db, context: () => ({ ...context.getStore()!, clientInfo: server.server.getClientVersion() ?? null }) });
        registerRunTools(register);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true,
          onsessioninitialized: (id) => { sessions.set(id, entry!); } });
        entry = { server, transport, credentialId: credential.credentialId, touched: Date.now() };
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
      }
      if (!entry) return reply.code(400).send(apiError('validation_error', 'Initialize a new session'));
      entry.touched = Date.now();
      reply.hijack();
      // Fastify owns body parsing; the SDK owns protocol negotiation and the raw reply.
      // Copy safe application headers because hijack bypasses Fastify's send pipeline.
      reply.raw.setHeader('x-request-id', request.id);
      reply.raw.setHeader('Cache-Control', 'no-store');
      try {
        await context.run({ access: { kind: 'credential', userId: credential.userId, credentialId: credential.credentialId,
          projectIds: credential.allowedProjectIds }, clientInfo: null, userAgent: request.headers['user-agent']?.slice(0, 512) ?? null },
        () => entry!.transport.handleRequest(request.raw, reply.raw, request.body));
      } catch {
        if (!reply.raw.headersSent) { reply.raw.writeHead(500, { 'Content-Type': 'application/json' }); reply.raw.end(JSON.stringify(apiError('internal_error', 'Internal server error'))); }
        else reply.raw.end();
      }
      if (request.method === 'DELETE' && typeof sessionId === 'string') await drop(sessionId);
    },
  });
}
