import { z } from 'zod';

import { REQUEST_ID_PATTERN } from '../app/conventions.js';
import { isProfileTimezone, PUBLIC_BIO_MAX, PUBLIC_GITHUB_PATTERN, PUBLIC_LINKEDIN_PATTERN, PUBLIC_NAME_MAX, PUBLIC_X_PATTERN } from '../public/fields.js';
import { PUBLIC_HANDLE_PATTERN } from '../public/handle.js';

/** Bounds chosen for P1-C2 and recorded in docs/api.md. They are not a schema migration. */
export const limits = {
  shortText: 300,
  longText: 8_000,
  tagLength: 64,
  tagCount: 32,
  urlLength: 2_048,
  prCount: 20,
  staleMinutesMax: 525_600,
  closeReason: 4_000,
} as const;

const requestIdSchema = z.string().regex(REQUEST_ID_PATTERN);
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const shortText = z.string().trim().min(1).max(limits.shortText);
const longText = z.string().max(limits.longText);
const workload = z.enum(['coding', 'automation']);

export function isHttpUrl(value: string): boolean {
  if (value.length < 1 || value.length > limits.urlLength) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

const httpUrl = z.string().trim().min(1).max(limits.urlLength).refine(isHttpUrl);
const nullableHttpUrl = httpUrl.nullable();

const reportingPolicySchema = z.strictObject({
  staleThresholdMinutes: z.number().int().min(1).max(limits.staleMinutesMax),
  heartbeatExpected: z.boolean(),
  instructions: longText,
});

const projectShape = {
  name: shortText,
  description: longText,
  type: workload,
  lifecycle: z.enum(['active', 'paused', 'completed', 'archived']),
  repositoryName: shortText.nullable(),
  repositoryUrl: nullableHttpUrl,
  prdUrl: nullableHttpUrl,
  tags: z.array(z.string().trim().min(1).max(limits.tagLength)).max(limits.tagCount),
  reportingPolicy: reportingPolicySchema,
  isPublic: z.boolean().optional(),
};

export const createProjectSchema = z.strictObject({
  ...projectShape,
  request_id: requestIdSchema,
});

const projectPatchKeys = ['name', 'description', 'type', 'lifecycle', 'repositoryName', 'repositoryUrl', 'prdUrl', 'tags', 'reportingPolicy', 'isPublic'] as const;

export const patchProjectSchema = z.strictObject({
  name: projectShape.name.optional(),
  description: projectShape.description.optional(),
  type: projectShape.type.optional(),
  lifecycle: projectShape.lifecycle.optional(),
  repositoryName: projectShape.repositoryName.optional(),
  repositoryUrl: projectShape.repositoryUrl.optional(),
  prdUrl: projectShape.prdUrl.optional(),
  tags: projectShape.tags.optional(),
  reportingPolicy: projectShape.reportingPolicy.optional(),
  isPublic: projectShape.isPublic,
  request_id: requestIdSchema,
  expected_revision: revisionSchema,
}).refine((value) => projectPatchKeys.some((key) => value[key] !== undefined));

const prSchema = z.strictObject({
  number: z.number().int().min(1).max(2_147_483_647),
  title: shortText,
  url: httpUrl,
  repositoryName: shortText,
  primary: z.boolean(),
});

const runPatchKeys = ['title', 'taskId', 'harness', 'model', 'completionSummary', 'blocker', 'noPrReason', 'prReferences'] as const;

export const patchRunSchema = z.strictObject({
  title: shortText.optional(),
  taskId: shortText.nullable().optional(),
  harness: shortText.nullable().optional(),
  model: shortText.nullable().optional(),
  completionSummary: longText.nullable().optional(),
  blocker: longText.nullable().optional(),
  noPrReason: longText.nullable().optional(),
  prReferences: z.array(prSchema).max(limits.prCount).optional(),
  request_id: requestIdSchema,
  expected_revision: revisionSchema,
}).refine((value) => runPatchKeys.some((key) => value[key] !== undefined));

const publicHandleSchema = z.string().trim().toLowerCase().regex(PUBLIC_HANDLE_PATTERN);

export const alertPreferencesSchema = z.strictObject({
  blocked: z.boolean(),
  stale: z.boolean(),
  review: z.boolean(),
});

const nullableTrimmed = (max: number) => z.union([z.null(), z.string().trim().min(1).max(max)]);
const nullablePattern = (pattern: RegExp) => z.union([z.null(), z.string().regex(pattern)]);

export const publicProfileSchema = z.strictObject({
  name: nullableTrimmed(PUBLIC_NAME_MAX),
  bio: nullableTrimmed(PUBLIC_BIO_MAX),
  github: nullablePattern(PUBLIC_GITHUB_PATTERN),
  x: nullablePattern(PUBLIC_X_PATTERN),
  linkedin: nullablePattern(PUBLIC_LINKEDIN_PATTERN),
  timezone: z.string().refine(isProfileTimezone),
});

export const patchAccountSchema = z.strictObject({
  publicHandle: z.union([z.null(), publicHandleSchema]).optional(),
  alerts: alertPreferencesSchema.optional(),
  publicProfile: publicProfileSchema.optional(),
  request_id: requestIdSchema,
}).refine((value) => value.publicHandle !== undefined || value.alerts !== undefined || value.publicProfile !== undefined);

export const closeRunSchema = z.strictObject({
  outcome: z.enum(['failed', 'cancelled']),
  reason: z.string().trim().min(1).max(limits.closeReason),
  expected_revision: revisionSchema,
  request_id: requestIdSchema,
});

export const dismissRunSchema = z.strictObject({
  expected_revision: revisionSchema,
  request_id: requestIdSchema,
});

export const markRunDoneSchema = z.strictObject({
  expected_revision: revisionSchema,
  request_id: requestIdSchema,
});

// Empty cursor and limit are omitted. parsePageQuery treats them as the first page and the default limit.
const pageShape = {
  cursor: z.string().max(512).optional(),
  limit: z.string().optional(),
};

export const projectListQuerySchema = z.strictObject({
  ...pageShape,
  include_archived: z.enum(['true', 'false']).optional(),
});

export const scopedListQuerySchema = z.strictObject({
  ...pageShape,
  project_id: z.string().min(1).max(128).optional(),
});

export type PatchAccountBody = z.infer<typeof patchAccountSchema>;
export type CreateProjectBody = z.infer<typeof createProjectSchema>;
export type PatchProjectBody = z.infer<typeof patchProjectSchema>;
export type PatchRunBody = z.infer<typeof patchRunSchema>;
export type CloseRunBody = z.infer<typeof closeRunSchema>;
export type MarkRunDoneBody = z.infer<typeof markRunDoneSchema>;
