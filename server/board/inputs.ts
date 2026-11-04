import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const revision = z.number().int().nonnegative().max(2147483647);
export const kind = z.enum(['note', 'decision', 'question', 'hazard', 'handoff', 'state']);
const key = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
export const listInput = z.object({
  project_id: id, status: z.enum(['open', 'resolved', 'all']).default('open'),
  kind: kind.optional(), key: key.optional(), task_ref: z.string().max(200).optional(),
  cursor: z.string().max(512).optional(), limit: z.number().int().positive().max(100).default(50),
}).strict();
export const postInput = z.object({
  project_id: id, source_run_id: id, kind: z.enum(['note', 'decision', 'question', 'hazard', 'handoff']),
  title: z.string().min(1).max(200), body: z.string().max(10000).default(''),
  task_ref: z.string().max(200).optional(), addressed_to: z.string().max(200).optional(),
  supersedes_id: id.optional(), request_id: id,
}).strict();
export const stateInput = z.object({
  project_id: id, source_run_id: id, key, value: z.string().max(10000),
  title: z.string().min(1).max(200).optional(), task_ref: z.string().max(200).optional(),
  expected_revision: revision, request_id: id,
}).strict();
export const resolveInput = z.object({
  project_id: id, entry_id: id, source_run_id: id, expected_revision: revision,
  resolution: z.string().max(2000).optional(), request_id: id,
}).strict();
export const projectParams = z.object({ projectId: id }).strict();
export const entryParams = projectParams.extend({ entryId: id });
export const ownerResolveInput = z.object({ expected_revision: revision, resolution: z.string().max(2000).optional(), request_id: id }).strict();
export const ownerReopenInput = ownerResolveInput.omit({ resolution: true });
export const listQuery = listInput.omit({ project_id: true, key: true, task_ref: true, limit: true }).extend({
  limit: z.preprocess((v) => v === undefined || v === '' ? 50 : typeof v === 'string' && /^[0-9]+$/.test(v) ? Number(v) : v, z.number().int().positive().max(100)),
});
