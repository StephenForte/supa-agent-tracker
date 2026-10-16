import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import { requireUser } from '../app/auth-context.js';
import { apiError, errorCodes } from '../app/errors.js';
import { createDb, type AppDatabase } from '../db/client.js';
import type { UserAccess } from '../repo/access.js';
import * as stepRepo from '../repo/next-steps.js';
import { registerPrivateNoteRoutes } from '../notes/routes.js';
import { ConflictError, jsonSafe, parseInput, requestHash, runMutation, sendServiceError } from './protocol.js';

const id = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const projectParams = z.object({ projectId: id });
const stepParams = projectParams.extend({ stepId: id });
const completionBody = z.object({
  done: z.boolean(),
  expected_revision: z.number().int().nonnegative(),
  request_id: id,
}).strict();

function userAccess(request: FastifyRequest, reply: FastifyReply): UserAccess | undefined {
  const userId = request.user?.userId;
  if (!userId) {
    reply.code(401).send(apiError(errorCodes.unauthenticated, 'Sign in required'));
    return undefined;
  }
  return { kind: 'user', userId };
}

function registerNextStepRoutes(app: FastifyInstance, db: AppDatabase): void {
  app.get('/api/projects/:projectId/next-steps', { preHandler: requireUser }, async (request, reply) => {
    const access = userAccess(request, reply);
    if (!access) return;
    try {
      const params = parseInput(projectParams, request.params);
      return jsonSafe(await stepRepo.listNextSteps(db, access, params.projectId));
    } catch (error) {
      return sendServiceError(reply, error);
    }
  });

  app.post('/api/projects/:projectId/next-steps/:stepId/completion', { preHandler: requireUser }, async (request, reply) => {
    const access = userAccess(request, reply);
    if (!access) return;
    try {
      const params = parseInput(stepParams, request.params);
      const body = parseInput(completionBody, request.body);
      return await runMutation(reply, db, access, body.request_id, requestHash({
        operation: 'set_step_completion',
        projectId: params.projectId,
        stepId: params.stepId,
        ...body,
      }), async (tx) => {
        const written = await stepRepo.setStepCompletion(tx, access, params.projectId, params.stepId, body.expected_revision, body.done);
        if (written.status === 'conflict') throw new ConflictError(jsonSafe(written.current));
        return written.value;
      });
    } catch (error) {
      if (reply.sent) return;
      return sendServiceError(reply, error);
    }
  });
}

export async function registerStepsAndNotesRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): Promise<void> {
  const db = createDb(deps.pool);
  registerNextStepRoutes(app, db);
  registerPrivateNoteRoutes(app, db);
}
