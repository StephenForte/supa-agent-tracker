import type { preHandlerAsyncHookHandler } from 'fastify';

import { fromNodeHeaders } from 'better-auth/node';
import { authRuntime } from '../auth/runtime.js';
import { apiError, errorCodes } from './errors.js';

/**
 * Auth middleware interfaces for later tasks. These preHandlers are test stubs.
 * P1-B2 replaces requireUser with browser sessions. P1-C1 replaces
 * requireMcpCredential with hashed bearer tokens (D-018). Neither stub is
 * authentication: outside NODE_ENV=test they always respond 401.
 *
 * In tests, requireUser reads `x-test-user-id`.
 * requireMcpCredential reads `Authorization: Bearer stub:<userId>` or
 * `Bearer stub:<userId>:<projectId>[,<projectId>...]`.
 */
export interface BrowserSession {
  userId: string;
}

export interface McpCredential {
  userId: string;
  allowedProjectIds: readonly string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: BrowserSession;
    mcpCredential?: McpCredential;
  }
}

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const requireUser: preHandlerAsyncHookHandler = async (request, reply) => {
  const userId = request.headers['x-test-user-id'];
  if (process.env.NODE_ENV === 'test' && typeof userId === 'string' && ID_PATTERN.test(userId)) {
    request.user = { userId };
    return;
  }
  const runtime = authRuntime(request.server);
  if (runtime) {
    try {
      // Cookie is the sole browser credential. Do not accept bearer headers.
      const headers = fromNodeHeaders({ cookie: request.headers.cookie });
      const session = await runtime.auth.api.getSession({ headers });
      if (session) {
        request.user = { userId: session.user.id };
        return;
      }
    } catch {
      // Neither library/database errors nor request secrets enter logs or bodies.
    }
  }
  return reply.code(401).send(apiError(errorCodes.unauthenticated, 'Sign in required'));
};

export const requireMcpCredential: preHandlerAsyncHookHandler = async (request, reply) => {
  if (!stubAuthEnabled()) {
    return reply.code(401).send(apiError(errorCodes.unauthenticated, 'Authentication is not implemented'));
  }
  const credential = parseStubBearer(request.headers.authorization);
  if (!credential) {
    return reply.code(401).send(apiError(errorCodes.unauthenticated, 'Bearer credential required'));
  }
  request.mcpCredential = credential;
};

function stubAuthEnabled(): boolean {
  return process.env.NODE_ENV === 'test';
}

function parseStubBearer(header: string | undefined): McpCredential | null {
  if (header === undefined || !header.startsWith('Bearer stub:')) return null;
  const rest = header.slice('Bearer stub:'.length);
  const colon = rest.indexOf(':');
  const userId = colon === -1 ? rest : rest.slice(0, colon);
  const projectList = colon === -1 ? '' : rest.slice(colon + 1);
  const allowedProjectIds = projectList.length === 0 ? [] : projectList.split(',');
  if (!ID_PATTERN.test(userId)) return null;
  if (allowedProjectIds.some((id) => !ID_PATTERN.test(id))) return null;
  return { userId, allowedProjectIds };
}
