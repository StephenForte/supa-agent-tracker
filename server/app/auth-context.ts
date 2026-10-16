import type { preHandlerAsyncHookHandler } from 'fastify';

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
  if (!stubAuthEnabled()) {
    return reply.code(401).send(apiError(errorCodes.unauthenticated, 'Authentication is not implemented'));
  }
  const userId = request.headers['x-test-user-id'];
  if (typeof userId !== 'string' || !ID_PATTERN.test(userId)) {
    return reply.code(401).send(apiError(errorCodes.unauthenticated, 'Sign in required'));
  }
  request.user = { userId };
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
