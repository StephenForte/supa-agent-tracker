import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

const trustProxyHopsSchema = z.preprocess(
  (value) => (value === undefined ? '0' : value),
  z.string().regex(/^[0-5]$/, 'must be an integer from 0 to 5').transform((value) => Number(value)),
);

const envSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, 'is required'),
  PORT: z.coerce.number().int().positive('must be a positive integer').default(3000),
  NODE_ENV: nodeEnvSchema.default('development'),
  PUBLIC_URL: z.url('must be an absolute URL'),
  TRUST_PROXY_HOPS: trustProxyHopsSchema,
});

export type NodeEnv = z.infer<typeof nodeEnvSchema>;

export interface AppConfig {
  databaseUrl: string;
  port: number;
  nodeEnv: NodeEnv;
  publicUrl: string;
  /** Derived from NODE_ENV. Production boots apply migrations; there is no separate env var. */
  migrateOnBoot: boolean;
  /** Reverse-proxy hops trusted when deriving request.ip. 0 ignores X-Forwarded-For. Omission means 0. */
  trustProxyHops?: number;
  auth?: AuthConfig;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse({
    DATABASE_URL: env.DATABASE_URL,
    PORT: env.PORT,
    NODE_ENV: env.NODE_ENV,
    PUBLIC_URL: env.PUBLIC_URL,
    TRUST_PROXY_HOPS: env.TRUST_PROXY_HOPS,
  });
  if (!parsed.success) {
    throw new ConfigError(formatConfigError(parsed.error));
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    publicUrl: parsed.data.PUBLIC_URL,
    migrateOnBoot: parsed.data.NODE_ENV === 'production',
    trustProxyHops: parsed.data.TRUST_PROXY_HOPS,
    auth: loadAuthConfig(env, parsed.data.NODE_ENV),
  };
}

function formatConfigError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'environment';
    return `- ${field}: ${issue.message}`;
  });
  return `Invalid server configuration:\n${lines.join('\n')}`;
}

export interface AuthConfig {
  secret: string;
  registrationAllowlist: string[];
  emailProvider: 'console' | 'resend';
  resendApiKey?: string;
  emailFrom?: string;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv, nodeEnv: NodeEnv): AuthConfig {
  const errors: string[] = [];
  const secret = env.BETTER_AUTH_SECRET ?? (nodeEnv === 'test' ? 'test-only-auth-secret-at-least-32-characters' : '');
  if (secret.length < 32) errors.push('- BETTER_AUTH_SECRET: must contain at least 32 characters');
  const provider = env.EMAIL_PROVIDER ?? 'console';
  if (provider !== 'console' && provider !== 'resend') errors.push('- EMAIL_PROVIDER: must be console or resend');
  if (provider === 'resend') {
    if (!env.RESEND_API_KEY?.trim()) errors.push('- RESEND_API_KEY: is required');
    if (!env.EMAIL_FROM?.trim()) errors.push('- EMAIL_FROM: is required');
  }
  if (errors.length) throw new ConfigError(`Invalid server configuration:\n${errors.join('\n')}`);
  return {
    secret,
    registrationAllowlist: [...new Set((env.REGISTRATION_ALLOWLIST ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))],
    emailProvider: provider as 'console' | 'resend',
    ...(env.RESEND_API_KEY ? { resendApiKey: env.RESEND_API_KEY } : {}),
    ...(env.EMAIL_FROM ? { emailFrom: env.EMAIL_FROM } : {}),
  };
}
