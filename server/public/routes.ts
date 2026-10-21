import type { FastifyInstance } from 'fastify';

import { apiError, errorCodes } from '../app/errors.js';
import type { RouteDeps } from '../app/routes.js';
import { createDb } from '../db/client.js';
import { readPublicAvatar } from './avatar.js';
import { PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS } from './handle.js';
import { createIpLimiter } from './limit.js';
import { readPublicProfile } from './profile.js';
import { readPublicAgents } from './read.js';

const notFound = apiError(errorCodes.not_found, 'Not found');

/** Unauthenticated. Session cookies and bearer tokens are ignored. Not an MCP tool. */
export async function registerPublicRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const db = createDb(deps.pool);
  const allowed = createIpLimiter(PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS);
  const allowedAvatar = createIpLimiter(PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS);
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

  app.get<{ Params: { handle: string } }>('/api/public/:handle/profile', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!allowed(request.ip || 'unknown')) {
      reply.header('retry-after', '60');
      return reply.code(429).send(apiError(errorCodes.rate_limited, 'Too many requests'));
    }
    const page = await readPublicProfile(db, request.params.handle, new Date());
    if (!page) return reply.code(404).send(notFound);
    return reply.send(page); // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write plain object → Fastify JSON serialiser
  });

  app.get<{ Params: { handle: string } }>('/api/public/:handle/avatar', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!allowedAvatar(request.ip || 'unknown')) {
      reply.header('retry-after', '60');
      return reply.code(429).send(apiError(errorCodes.rate_limited, 'Too many requests'));
    }
    const image = await readPublicAvatar(db, request.params.handle);
    if (!image) return reply.code(404).send(notFound);
    const etag = `"${image.sha256}"`;
    reply.header('cache-control', 'no-cache');
    reply.header('content-security-policy', "default-src 'none'; sandbox");
    reply.header('etag', etag);
    const presented = request.headers['if-none-match'];
    const matches = (Array.isArray(presented) ? presented : presented ? [presented] : [])
      .some((value: string) => value.split(',').some((part: string) => part.trim() === etag));
    if (matches) return reply.code(304).send();
    reply.type(image.contentType);
    return reply.send(image.bytes); // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write stored image bytes, sniffed type, nosniff and CSP sandbox
  });
}
