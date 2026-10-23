import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AccessError } from '../repo/access.js';
import { PaginationError } from '../app/pagination.js';
import { apiError, validationFields } from '../app/errors.js';

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
  validation?: { reason: string; fields?: string[] };
  constructor(public code: string, public current?: unknown) { super(code); }
}
/** Handler-rule validation. `reason` is a source constant; `fields` are schema names, never caller values. */
export function validationRule(reason: string, fields?: readonly string[]): ProtocolError {
  const error = new ProtocolError('validation_error');
  error.validation = fields && fields.length > 0 ? { reason, fields: [...fields] } : { reason };
  return error;
}
export function failure(error: unknown) {
  const code = error instanceof ProtocolError || error instanceof AccessError ? error.code
    : error instanceof z.ZodError || error instanceof PaginationError ? 'validation_error' : 'internal_error';
  return apiError(code, code === 'internal_error' ? 'Internal server error' : code, detailsFor(error));
}
function detailsFor(error: unknown): unknown {
  if (error instanceof ProtocolError && error.current !== undefined) return { current: error.current };
  if (error instanceof z.ZodError) {
    const fields = validationFields(error.issues);
    return fields.length > 0 ? { fields } : undefined;
  }
  if (error instanceof ProtocolError && error.validation) {
    const { reason, fields } = error.validation;
    return fields && fields.length > 0 ? { fields: [...fields], reason } : { reason };
  }
  return undefined;
}
export function httpStatus(code: string): number {
  return ({ validation_error: 400, not_found: 404, forbidden: 403, conflict: 409, idempotency_mismatch: 409, rate_limited: 429 } as Record<string, number>)[code] ?? 500;
}
