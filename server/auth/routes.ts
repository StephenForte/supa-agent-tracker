import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { RouteDeps } from '../app/routes.js';
import type { AppConfig } from '../config.js';
import { apiError, errorCodes } from '../app/errors.js';
import { createAuthRuntime } from './runtime.js';

const methods = new Map([
  ['/sign-up/email', 'POST'], ['/sign-in/email', 'POST'], ['/sign-out', 'POST'],
  ['/verify-email', 'GET'], ['/send-verification-email', 'POST'],
  ['/request-password-reset', 'POST'], ['/reset-password', 'POST'],
  ['/change-password', 'POST'], ['/get-session', 'GET'], ['/list-sessions', 'GET'],
  ['/revoke-session', 'POST'], ['/revoke-sessions', 'POST'], ['/revoke-other-sessions', 'POST'],
]);
const generic = { status: true };

export async function registerAuthRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  // buildApp passes its full options as RouteDeps; no shared dependency interface change.
  const config = (deps as RouteDeps & { config: AppConfig }).config;
  const runtime = createAuthRuntime(deps.pool, config);
  app.decorate('browserAuth', runtime);
  const attempts = new Map<string, { count: number; expires: number }>();
  function allowed(keys: string[]): boolean {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
    if (keys.some((key) => (attempts.get(key)?.count ?? 0) >= 5)) return false;
    if (attempts.size + keys.filter((key) => !attempts.has(key)).length > 10_000) return false;
    for (const key of keys) {
      const entry = attempts.get(key) ?? { count: 0, expires: now + 60_000 };
      entry.count++;
      attempts.set(key, entry);
    }
    return true;
  }
  app.addHook('onRequest', async (request, reply) => {
    if (!/^\/api(?:\/|\?|$)/.test(request.url) || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin;
    // Explicit mismatching origins are rejected even without a cookie. For
    // cookie-authenticated writes, a missing Origin must not bypass CSRF either.
    if ((origin !== undefined && origin !== runtime.origin) ||
        (request.headers.cookie !== undefined && origin !== runtime.origin) ||
        request.headers['sec-fetch-site'] === 'cross-site') {
      return reply.code(403).send(apiError(errorCodes.forbidden, 'Origin is not allowed'));
    }
  });
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    url: '/api/auth/*',
    // Fastify logs the URL before hooks run. Verification/reset query strings
    // contain secrets, so disable request AND error logging for this route.
    logLevel: 'silent',
    async handler(request, reply) {
      reply.header('cache-control', 'no-store');
      const url = new URL(request.url, runtime.origin);
      const path = url.pathname.slice('/api/auth'.length);
      if (methods.get(path) !== request.method) return reply.code(404).send(apiError(errorCodes.not_found, 'Not found'));
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? { ...request.body as Record<string, unknown> } : undefined;
      if (typeof body?.email === 'string') body.email = body.email.trim().toLowerCase();
      if (typeof body?.email === 'string' && body.email.length > 254) {
        return reply.code(400).send(apiError(errorCodes.validation_error, 'Authentication request could not be processed'));
      }
      if (path === '/sign-up/email') {
        if (typeof body?.email !== 'string' || !runtime.settings.registrationAllowlist.includes(body.email)) {
          return reply.code(403).send(apiError(errorCodes.forbidden, 'Registration is by invitation only'));
        }
      }
      if (path === '/sign-in/email') {
        const email = typeof body?.email === 'string' ? body.email : '';
        if (!allowed([`ip:${request.ip}`, `email:${email}`])) {
          return reply.code(429).send(apiError(errorCodes.rate_limited, 'Too many requests'));
        }
      }
      if (path === '/sign-in/email' && body) body.rememberMe = true;
      if (path === '/change-password' && body) body.revokeOtherSessions = true;
      // Never trust client-supplied proxy headers for the library's IP limiter.
      const headers = fromNodeHeaders(request.headers);
      headers.set('x-supa-auth-ip', request.ip);
      // Resending verification is a public, enumeration-resistant operation.
      if (path === '/send-verification-email') headers.delete('cookie');
      try {
        const response = await runtime.auth.handler(new Request(url, {
          method: request.method, headers,
          ...(body ? { body: JSON.stringify(body) } : {}),
        }));
        const cookies = response.headers.getSetCookie();
        if (cookies.length) reply.header('set-cookie', cookies);
        const location = response.headers.get('location');
        if (location) reply.header('location', location);
        // Reset/resend do not reveal existence or email-provider failure.
        if (['/request-password-reset', '/send-verification-email'].includes(path) && (response.ok || response.status >= 500)) return generic;
        if (response.ok && path === '/sign-up/email') return generic;
        if (path === '/sign-up/email' && response.status === 422 && typeof body?.email === 'string') {
          // A concurrent insert or a pre-auth mixed-case identity can hit the
          // case-insensitive unique index after the library's exact lookup.
          // Preserve generic registration without concealing unrelated errors.
          const existing = await deps.pool.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [body.email]);
          if (existing.rowCount) return generic;
        }
        if (response.status >= 400) {
          const status = response.status;
          const code = status === 429 ? errorCodes.rate_limited : status === 401 ? errorCodes.unauthenticated : status === 403 ? errorCodes.forbidden : status === 404 ? errorCodes.not_found : status >= 500 ? errorCodes.internal_error : errorCodes.validation_error;
          return reply.code(status).send(apiError(code, status === 429 ? 'Too many requests' : status >= 500 ? 'Internal server error' : 'Authentication request could not be processed'));
        }
        reply.code(response.status);
        const text = await response.text();
        if (response.headers.get('content-type')?.includes('application/json')) return reply.type('application/json').send(text);
        return reply.send(text || null);
      } catch {
        if (['/request-password-reset', '/send-verification-email'].includes(path)) return generic;
        return reply.code(500).send(apiError(errorCodes.internal_error, 'Internal server error'));
      }
    },
  });
}
