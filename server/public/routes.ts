import type { FastifyInstance } from 'fastify';

import { apiError, errorCodes } from '../app/errors.js';
import type { RouteDeps } from '../app/routes.js';
import { createDb } from '../db/client.js';
import { PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS } from './handle.js';
import { createIpLimiter } from './limit.js';
import { readPublicAgents } from './read.js';

const notFound = apiError(errorCodes.not_found, 'Not found');

/** Unauthenticated. Session cookies and bearer tokens are ignored. Not an MCP tool. */
export async function registerPublicRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const db = createDb(deps.pool);
  const allowed = createIpLimiter(PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS);
  app.get<{ Params: { handle: string } }>('/api/public/:handle/agents', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!allowed(request.ip || 'unknown')) {
      reply.header('retry-after', '60');
      return reply.code(429).send(apiError(errorCodes.rate_limited, 'Too many requests'));
    }
    const page = await readPublicAgents(db, request.params.handle);
    if (!page) return reply.code(404).send(notFound);
    return reply.send(page); // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write plain object → Fastify JSON serialiser
  });
}
