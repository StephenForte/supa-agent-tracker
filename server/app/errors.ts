import type { FastifyReply } from 'fastify';

/** Hard cap for JSON request bodies. Fastify rejects anything larger with 413. */
export const JSON_BODY_LIMIT_BYTES = 1_048_576;

export const errorCodes = {
  validation_error: 'validation_error',
  unauthenticated: 'unauthenticated',
  forbidden: 'forbidden',
  not_found: 'not_found',
  conflict: 'conflict',
  idempotency_mismatch: 'idempotency_mismatch',
  payload_too_large: 'payload_too_large',
  internal_error: 'internal_error',
  database_unreachable: 'database_unreachable',
  migrations_pending: 'migrations_pending',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiError(code: string, message: string, details?: unknown): ApiErrorBody {
  const error: ApiErrorBody['error'] = { code, message };
  if (details !== undefined) error.details = details;
  return { error };
}

/** 409 body. The current resource is error.details.current so clients can retry. */
export function conflictBody(message: string, current: unknown): ApiErrorBody {
  return apiError(errorCodes.conflict, message, { current });
}

export function sendConflict(reply: FastifyReply, message: string, current: unknown): FastifyReply {
  return reply.code(409).send(conflictBody(message, current));
}
