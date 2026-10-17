import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transaction } from '../repo/access.js';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { createDb } from '../db/client.js';
import { users, sessions, accounts, authVerifications } from '../db/schema.js';
import { loadAuthConfig, type AppConfig } from '../config.js';
import { createEmailSender } from '../email/index.js';

export function createAuthRuntime(pool: pg.Pool, config: AppConfig) {
  // Legacy foundation tests construct AppConfig by hand. The fallback test
  // secret is permitted only in the actual test process; normal boot always
  // passes the validated config.auth from loadConfig.
  const settings = config.auth ?? loadAuthConfig(process.env, process.env.NODE_ENV === 'test' ? 'test' : config.nodeEnv);
  const origin = new URL(config.publicUrl).origin;
  const email = createEmailSender(settings, config.nodeEnv);
  const db = createDb(pool);
  const signupScope = new AsyncLocalStorage<Transaction>();
  const scopedDb = new Proxy(db, {
    get(target, property) {
      const current = signupScope.getStore() ?? target;
      const value = Reflect.get(current, property);
      return typeof value === 'function' ? value.bind(current) : value;
    },
  });
  const signupTransaction = <T>(operation: (tx: Transaction) => Promise<T>) =>
    db.transaction(tx => signupScope.run(tx, () => operation(tx)));
  const auth = betterAuth({
    baseURL: origin,
    basePath: '/api/auth',
    secret: settings.secret,
    trustedOrigins: [origin],
    logger: { disabled: true },
    onAPIError: { onError(error) {
      // Better Call otherwise prints raw non-API errors, including SQL params.
      // Only signup's transaction uses this boundary; preserve normal API errors.
      if (signupScope.getStore() && !(error instanceof APIError)) {
        throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Internal server error' });
      }
    } },
    database: drizzleAdapter(scopedDb, {
      provider: 'pg',
      transaction: true,
      schema: { user: users, session: sessions, account: accounts, verification: authVerifications },
    }),
    user: { fields: { name: 'displayName' } },
    account: { fields: { password: 'passwordHash' } },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    verification: { storeIdentifier: 'hashed' },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        const link = new URL('/reset-password', origin);
        link.searchParams.set('token', token);
        await email.sendEmail({ to: user.email, subject: 'Reset your password', text: `Reset your password: ${link.href}` });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      async sendVerificationEmail({ user, token }) {
        const link = new URL('/verify-email', origin);
        link.searchParams.set('token', token);
        await email.sendEmail({ to: user.email, subject: 'Verify your email', text: `Verify your email: ${link.href}` });
      },
    },
    // Session reads have no password/brute-force surface and must survive continuous use.
    rateLimit: { enabled: true, window: 60, max: 100, storage: 'memory', customRules: { '/get-session': false, '/sign-in/email': { window: 60, max: 5 } } },
    advanced: {
      // Better Auth otherwise skips Origin validation under NODE_ENV=test.
      // Keep the same callback checks active in HTTP tests and production.
      disableOriginCheck: false,
      useSecureCookies: origin.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:') },
      ipAddress: { ipAddressHeaders: ['x-supa-auth-ip'] },
    },
  });
  return { auth, email, config, settings, origin, signupTransaction };
}

export type AuthRuntime = ReturnType<typeof createAuthRuntime>;

declare module 'fastify' {
  interface FastifyInstance { browserAuth?: AuthRuntime }
}

export function authRuntime(app: FastifyInstance): AuthRuntime | undefined {
  return app.browserAuth;
}
