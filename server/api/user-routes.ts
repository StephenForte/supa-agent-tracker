import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { ZodError, ZodType } from 'zod';

import { authRuntime } from '../auth/runtime.js';
import { isAdmin } from '../invites/admin.js';
import { requireUser } from '../app/auth-context.js';
import { PaginationError } from '../app/pagination.js';
import { apiError, conflictBody, errorCodes } from '../app/errors.js';
import { createDb } from '../db/client.js';
import { AccessError, type Transaction, type UserAccess } from '../repo/access.js';
import { withIdempotency } from '../repo/idempotency-keys.js';
import { createProject, getProject, listProjects, updateProject } from '../repo/projects.js';
import { getRun, markRunDone, updateRun } from '../repo/runs.js';
import { findOwnedRun, listUserAgents, listUserRuns, readAccount } from '../repo/views.js';
import {
  detailFromGetRun,
  toAccount,
  toAgent,
  toClosePatch,
  toProject,
  toRepoProjectInput,
  toRepoProjectPatch,
  toRunListItem,
  toRunPatch,
} from './map.js';
import { setPublicHandle } from '../public/account.js';
import {
  closeRunSchema,
  markRunDoneSchema,
  createProjectSchema,
  patchAccountSchema,
  patchProjectSchema,
  patchRunSchema,
  projectListQuerySchema,
  scopedListQuerySchema,
} from './schemas.js';

interface SavedResponse {
  statusCode: number;
  payload: unknown;
}

export async function registerUserApiRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): Promise<void> {
  const db = createDb(deps.pool);
  const guard = { preHandler: requireUser };
  const accountBody = (account: ReturnType<typeof toAccount>) => ({ ...account, isAdmin: isAdmin(account, authRuntime(app)!.settings) });

  app.get('/api/account', guard, (request, reply) => handle(reply, async () => {
    const account = toAccount(await readAccount(db, accessOf(request)));
    return reply.send(accountBody(account));
  }));

  app.patch('/api/account', guard, (request, reply) => handle(reply, async () => {
    const body = parse(patchAccountSchema, request.body, reply);
    if (!body) return;
    const access = accessOf(request);
    return commit(db, reply, access, body.request_id, 'account_update', body, async (tx) => {
      const updated = await setPublicHandle(tx, access, body.publicHandle);
      if (updated.status === 'taken') {
        return { statusCode: 409, payload: apiError(errorCodes.conflict, 'That public handle is already taken') };
      }
      return { statusCode: 200, payload: accountBody(toAccount(updated.user)) };
    });
  }));

  app.get('/api/projects', guard, (request, reply) => handle(reply, async () => {
    const query = parse(projectListQuerySchema, request.query, reply);
    if (!query) return;
    const page = await listProjects(db, accessOf(request), {
      cursor: query.cursor,
      limit: query.limit,
      includeArchived: query.include_archived === 'true',
    });
    return reply.send({ items: page.items.map(toProject), nextCursor: page.nextCursor });
  }));

  app.post('/api/projects', guard, (request, reply) => handle(reply, async () => {
    const body = parse(createProjectSchema, request.body, reply);
    if (!body) return;
    const access = accessOf(request);
    return commit(db, reply, access, body.request_id, 'project_create', body, async (tx) => {
      const row = await createProject(tx, access, toRepoProjectInput(body));
      return { statusCode: 201, payload: toProject(row) };
    });
  }));

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId', guard, (request, reply) => handle(reply, async () => {
    const row = await getProject(db, accessOf(request), request.params.projectId);
    return reply.send(toProject(row));
  }));

  app.patch<{ Params: { projectId: string } }>('/api/projects/:projectId', guard, (request, reply) => handle(reply, async () => {
    const body = parse(patchProjectSchema, request.body, reply);
    if (!body) return;
    const access = accessOf(request);
    const projectId = request.params.projectId;
    return commit(db, reply, access, body.request_id, 'project_update', body, async (tx) => {
      const result = await updateProject(tx, access, projectId, body.expected_revision, toRepoProjectPatch(body));
      if (result.status === 'conflict') return conflict('Revision conflict', toProject(result.current));
      return { statusCode: 200, payload: toProject(result.value) };
    });
  }));

  app.get('/api/agents', guard, (request, reply) => handle(reply, async () => {
    const query = parse(scopedListQuerySchema, request.query, reply);
    if (!query) return;
    const page = await listUserAgents(db, accessOf(request), { projectId: query.project_id, cursor: query.cursor, limit: query.limit });
    return reply.send({ items: page.items.map(toAgent), nextCursor: page.nextCursor });
  }));

  app.get('/api/runs', guard, (request, reply) => handle(reply, async () => {
    const query = parse(scopedListQuerySchema, request.query, reply);
    if (!query) return;
    const page = await listUserRuns(db, accessOf(request), { projectId: query.project_id, cursor: query.cursor, limit: query.limit });
    return reply.send({ items: page.items.map(toRunListItem), nextCursor: page.nextCursor });
  }));

  app.get<{ Params: { runId: string } }>('/api/runs/:runId', guard, (request, reply) => handle(reply, async () => {
    const access = accessOf(request);
    const owned = await findOwnedRun(db, access, request.params.runId);
    const row = await getRun(db, access, owned.projectId, request.params.runId);
    return reply.send(detailFromGetRun(row));
  }));

  app.patch<{ Params: { runId: string } }>('/api/runs/:runId', guard, (request, reply) => handle(reply, async () => {
    const body = parse(patchRunSchema, request.body, reply);
    if (!body) return;
    const access = accessOf(request);
    const runId = request.params.runId;
    return commit(db, reply, access, body.request_id, 'run_update', body, async (tx) => {
      const owned = await findOwnedRun(tx, access, runId);
      const { patch, prReferences } = toRunPatch(body);
      const result = await updateRun(tx, access, owned.projectId, runId, body.expected_revision, patch, { prReferences });
      if (result.status === 'conflict') return conflict('Revision conflict', detailFromGetRun(await getRun(tx, access, owned.projectId, runId)));
      return { statusCode: 200, payload: detailFromGetRun(await getRun(tx, access, owned.projectId, runId)) };
    });
  }));

  app.post<{ Params: { runId: string } }>('/api/runs/:runId/close', guard, (request, reply) => handle(reply, async () => {
    const body = parse(closeRunSchema, request.body, reply);
    if (!body) return;
    const access = accessOf(request);
    const runId = request.params.runId;
    return commit(db, reply, access, body.request_id, 'run_close', body, async (tx) => {
      const owned = await findOwnedRun(tx, access, runId);
      const current = await getRun(tx, access, owned.projectId, runId);
      if (current.revision !== body.expected_revision) return conflict('Revision conflict', detailFromGetRun(current));
      // A close of an ended run is a 409 conflict carrying the current run, including a repeat of the same outcome.
      if (current.executionState !== 'running') return conflict('Run has already ended', detailFromGetRun(current));
      const result = await updateRun(tx, access, owned.projectId, runId, body.expected_revision, toClosePatch(body));
      if (result.status === 'conflict') return conflict('Revision conflict', detailFromGetRun(await getRun(tx, access, owned.projectId, runId)));
      return { statusCode: 200, payload: detailFromGetRun(await getRun(tx, access, owned.projectId, runId)) };
    });
  }));

  app.post<{ Params: { runId: string } }>('/api/runs/:runId/mark-done', guard, (request, reply) => handle(reply, async () => {
    const body = parse(markRunDoneSchema, request.body, reply);
    if (!body) return;
    const access = accessOf(request);
    const runId = request.params.runId;
    return commit(db, reply, access, body.request_id, 'run_mark_done', body, async (tx) => {
      const owned = await findOwnedRun(tx, access, runId);
      const current = await getRun(tx, access, owned.projectId, runId);
      if (current.revision !== body.expected_revision) return conflict('Revision conflict', detailFromGetRun(current));
      if (current.executionState !== 'finished') return conflict('Only finished runs can be marked done', detailFromGetRun(current));
      if (current.workStatus === 'completed') return conflict('Run is already completed', detailFromGetRun(current));
      const result = await markRunDone(tx, access, owned.projectId, runId, body.expected_revision);
      if (result.status === 'conflict') return conflict('Revision conflict', detailFromGetRun(await getRun(tx, access, owned.projectId, runId)));
      if (result.status === 'not_finished') return conflict('Only finished runs can be marked done', detailFromGetRun(await getRun(tx, access, owned.projectId, runId)));
      if (result.status === 'already_completed') return conflict('Run is already completed', detailFromGetRun(await getRun(tx, access, owned.projectId, runId)));
      return { statusCode: 200, payload: detailFromGetRun(await getRun(tx, access, owned.projectId, runId)) };
    });
  }));
}

function accessOf(request: FastifyRequest): UserAccess {
  const userId = request.user?.userId;
  if (!userId) throw new AccessError('forbidden');
  return { kind: 'user', userId };
}

function parse<T>(schema: ZodType<T>, value: unknown, reply: FastifyReply): T | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  reply.code(400).send(validationBody(parsed.error));
  return undefined;
}

async function commit(
  db: ReturnType<typeof createDb>,
  reply: FastifyReply,
  access: UserAccess,
  requestId: string,
  operationName: string,
  body: unknown,
  operation: (tx: Transaction) => Promise<SavedResponse>,
) {
  const result = await withIdempotency(db, access, requestId, requestHash(body), operation, operationName);
  return sendSaved(reply, result);
}

function sendSaved(reply: FastifyReply, result: Awaited<ReturnType<typeof withIdempotency>>) {
  if (result.status === 'idempotency_mismatch') {
    return reply.code(409).send(apiError(errorCodes.idempotency_mismatch, 'request_id was reused with a different body'));
  }
  if (!isSaved(result.response)) throw new Error('stored response is invalid');
  return reply.code(result.response.statusCode).send(result.response.payload);
}

function isSaved(value: unknown): value is SavedResponse {
  return typeof value === 'object' && value !== null && typeof (value as SavedResponse).statusCode === 'number' && 'payload' in value;
}

function conflict(message: string, current: unknown): SavedResponse {
  return { statusCode: 409, payload: conflictBody(message, current) };
}

function validationBody(error: ZodError) {
  const fields = [...new Set(error.issues.map((issue) => issue.path.map(String).join('.')))].filter((field) => field.length > 0);
  return apiError(errorCodes.validation_error, 'Request could not be processed', fields.length > 0 ? { fields } : undefined);
}

function requestHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(body))).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return Object.fromEntries(entries.map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

async function handle(reply: FastifyReply, operation: () => Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (reply.sent) return;
    if (sendKnown(reply, error)) return;
    throw error;
  }
}

function sendKnown(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof PaginationError || (error instanceof AccessError && error.code === 'validation_error')) {
    reply.code(400).send(apiError(errorCodes.validation_error, 'Request could not be processed'));
    return true;
  }
  if (error instanceof AccessError && error.code === 'not_found') {
    reply.code(404).send(apiError(errorCodes.not_found, 'Not found'));
    return true;
  }
  if (error instanceof AccessError && error.code === 'forbidden') {
    reply.code(403).send(apiError(errorCodes.forbidden, 'Forbidden'));
    return true;
  }
  return false;
}
