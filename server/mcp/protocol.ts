import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AccessError } from '../repo/access.js';
import { PaginationError } from '../app/pagination.js';
import { apiError } from '../app/errors.js';

export const id = z.string().min(1).max(128);
export const short = z.string().trim().min(1).max(200);
export const text = z.string().trim().min(1).max(8000);
export const requestId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const workStatus = z.enum(['in_progress', 'blocked', 'waiting_for_review', 'completed', 'failed', 'cancelled']);
export function requestHash(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
    return v;
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export class ProtocolError extends Error {
  constructor(public code: string, public current?: unknown) { super(code); }
}
export function failure(error: unknown) {
  const code = error instanceof ProtocolError || error instanceof AccessError ? error.code
    : error instanceof z.ZodError || error instanceof PaginationError ? 'validation_error' : 'internal_error';
  return apiError(code, code === 'internal_error' ? 'Internal server error' : code,
    error instanceof ProtocolError && error.current !== undefined ? { current: error.current } : undefined);
}
export function httpStatus(code: string): number {
  return ({ validation_error: 400, not_found: 404, forbidden: 403, conflict: 409, idempotency_mismatch: 409, rate_limited: 429 } as Record<string, number>)[code] ?? 500;
}
