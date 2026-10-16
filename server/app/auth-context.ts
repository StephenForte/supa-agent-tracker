import type { preHandlerAsyncHookHandler } from 'fastify';

import { fromNodeHeaders } from 'better-auth/node';
import { authRuntime } from '../auth/runtime.js';
import { credentialOrigin, authenticateBearer } from '../tokens/auth.js';
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
  credentialId: string;
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
      // A lookup outage is not a revoked session. Log only a fixed diagnostic;
      // library/database errors may contain credentials or connection details.
      request.log.error('Browser session lookup failed');
      return reply.code(500).send(apiError(errorCodes.internal_error, 'Internal server error'));
    }
  }
  return reply.code(401).send(apiError(errorCodes.unauthenticated, 'Sign in required'));
};

export const requireMcpCredential: preHandlerAsyncHookHandler = async (request, reply) => {
  const credential = await authenticateBearer(request);
  if (!credential) {
    const origin = credentialOrigin(request.server);
    reply.header('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"${request.headers.authorization !== undefined ? ', error="invalid_token"' : ''}`);
    return reply.code(401).send(apiError(errorCodes.unauthenticated, 'Bearer credential required'));
  }
  request.mcpCredential = credential;
};

function stubAuthEnabled(): boolean {
  return process.env.NODE_ENV === 'test';
}
