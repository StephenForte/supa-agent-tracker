/**
 * Mutation conventions for the API (P1-E and friends) and MCP (P1-C1).
 * This module names the contract. Those tasks implement storage and enforcement.
 */
export const mutationFields = {
  requestId: 'request_id',
  expectedRevision: 'expected_revision',
} as const;

export interface MutationRequest {
  request_id: string;
  expected_revision?: number;
}

/**
 * request_id: required on every mutation, 1–128 characters from [A-Za-z0-9._:-].
 * The same request_id with the same body returns the original response and does not apply the change again.
 * The same request_id with a different body returns 409 and error code idempotency_mismatch.
 * expected_revision: required on mutations of an existing resource. A mismatch returns 409
 * with error code conflict and the current resource at error.details.current.
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
