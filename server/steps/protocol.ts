import { createHash } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

import { apiError, errorCodes, sendConflict } from '../app/errors.js';
import { AccessError, type Access, type Database, type Transaction } from '../repo/access.js';
import { withIdempotency } from '../repo/idempotency-keys.js';

/** Stored and returned values are plain JSON. Dates become ISO-8601 strings. */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function requestHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export class ConflictError extends Error {
  readonly code = 'conflict' as const;
  constructor(public readonly current: unknown) {
    super('conflict');
    this.name = 'ConflictError';
  }
}

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AccessError('validation_error');
  return parsed.data;
}

export function sendServiceError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ConflictError) return sendConflict(reply, 'expected_revision does not match', error.current);
  if (error instanceof AccessError) {
    const status = error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : 400;
    const message = error.code === 'not_found' ? 'Not found' : error.code === 'forbidden' ? 'Forbidden' : 'Request could not be processed';
    return reply.code(status).send(apiError(error.code, message));
  }
  throw error;
}

/** Runs the domain write on the idempotency transaction. A conflict throws so the key is not stored and no row changes. */
export async function runMutation<T>(reply: FastifyReply, db: Database, access: Access, requestId: string, hash: string, operation: (tx: Transaction) => Promise<T>): Promise<unknown> {
  try {
    const result = await withIdempotency(db, access, requestId, hash, async (tx) => jsonSafe(await operation(tx)));
    if (result.status === 'idempotency_mismatch') {
      return reply.code(409).send(apiError(errorCodes.idempotency_mismatch, 'request_id was reused with a different body'));
    }
    return result.response;
  } catch (error) {
    return sendServiceError(reply, error);
  }
}
