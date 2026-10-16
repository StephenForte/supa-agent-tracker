import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

import { apiError, errorCodes } from './errors.js';

/** /api and /mcp never fall back to the SPA. /mcp* includes /mcp and /mcp/... */
export function isReservedPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/mcp');
}

export function requestPathname(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

export async function registerSpa(app: FastifyInstance, spaRoot: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: spaRoot,
    wildcard: false,
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = requestPathname(request.url);
    if (isReservedPath(pathname)) {
      return reply.code(404).send(apiError(errorCodes.not_found, 'Not found'));
    }
    return reply.sendFile('index.html');
  });
}
