import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { requireUser } from '../app/auth-context.js';
import { createDb } from '../db/client.js';
import * as repo from '../repo/board.js';
import { jsonSafe, parseInput, requestHash, runMutation, sendServiceError } from '../steps/protocol.js';
import { entryParams, listInput, listQuery, ownerReopenInput, ownerResolveInput, projectParams } from './inputs.js';

export async function registerBoardRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): Promise<void> {
  const db = createDb(deps.pool);
  app.get('/api/board/summary', { preHandler: requireUser }, async (request, reply) => {
    try { return jsonSafe(await repo.boardSummary(db, { kind: 'user', userId: request.user!.userId })); }
    catch (error) { return sendServiceError(reply, error); }
  });
  app.get('/api/projects/:projectId/board', { preHandler: requireUser }, async (request, reply) => {
    try {
      const params = parseInput(projectParams, request.params);
      const query = parseInput(listQuery, request.query);
      return jsonSafe(await repo.listBoard(db, { kind: 'user', userId: request.user!.userId }, parseInput(listInput, { ...query, project_id: params.projectId })));
    } catch (error) { return sendServiceError(reply, error); }
  });
  for (const action of ['resolve', 'reopen'] as const) {
    app.post(`/api/projects/:projectId/board/:entryId/${action}`, { preHandler: requireUser }, async (request, reply) => {
      try {
        const params = parseInput(entryParams, request.params);
        const body = parseInput(action === 'resolve' ? ownerResolveInput : ownerReopenInput, request.body);
        const access = { kind: 'user' as const, userId: request.user!.userId };
        const operation = action === 'resolve' ? 'board_entry_resolve' : 'board_entry_reopen';
        return await runMutation(reply, db, access, body.request_id, requestHash({ operation, ...params, ...body }),
          (tx) => repo.ownerStatus(tx, access, params.projectId, params.entryId, body.expected_revision, action === 'resolve', 'resolution' in body ? body.resolution as string : undefined), operation);
      } catch (error) { return sendServiceError(reply, error); }
    });
  }
}
