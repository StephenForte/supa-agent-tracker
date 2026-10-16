import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../app/auth-context.js';
import { apiError, errorCodes } from '../app/errors.js';
import type { AppDatabase } from '../db/client.js';
import type { UserAccess } from '../repo/access.js';
import * as noteRepo from '../repo/private-notes.js';
import { ConflictError, jsonSafe, parseInput, requestHash, runMutation, sendServiceError } from '../steps/protocol.js';

/** JavaScript string length. Documented in docs/api.md. Well under the 1 MiB JSON body limit. */
export const PRIVATE_NOTE_MAX_CHARS = 20_000;

const id = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const projectParams = z.object({ projectId: id });
const noteBody = z.object({
  text: z.string().max(PRIVATE_NOTE_MAX_CHARS),
  expected_revision: z.number().int().nonnegative(),
  request_id: id,
}).strict();

function session(request: FastifyRequest, reply: FastifyReply): UserAccess | undefined {
  const userId = request.user?.userId;
  if (!userId) {
    reply.code(401).send(apiError(errorCodes.unauthenticated, 'Sign in required'));
    return undefined;
  }
  return { kind: 'user', userId };
}

function emptyNote(projectId: string) {
  return { projectId, text: '', revision: 0, updatedAt: null };
}

export function registerPrivateNoteRoutes(app: FastifyInstance, db: AppDatabase): void {
  app.get('/api/projects/:projectId/private-note', { preHandler: requireUser }, async (request, reply) => {
    const access = session(request, reply);
    if (!access) return;
    try {
      const params = parseInput(projectParams, request.params);
      const note = await noteRepo.getPrivateNote(db, access, params.projectId);
      if (!note) return emptyNote(params.projectId);
      return jsonSafe({ projectId: note.projectId, text: note.text, updatedAt: note.updatedAt, revision: note.revision });
    } catch (error) {
      return sendServiceError(reply, error);
    }
  });

  app.put('/api/projects/:projectId/private-note', { preHandler: requireUser }, async (request, reply) => {
    const access = session(request, reply);
    if (!access) return;
    try {
      const params = parseInput(projectParams, request.params);
      const body = parseInput(noteBody, request.body);
      return await runMutation(reply, db, access, body.request_id, requestHash({
        operation: 'set_private_note',
        projectId: params.projectId,
        ...body,
      }), async (tx) => {
        const written = await noteRepo.setPrivateNote(tx, access, params.projectId, body.expected_revision, body.text);
        if (written.status === 'conflict') throw new ConflictError(jsonSafe(noteView(written.current)));
        return noteView(written.value);
      });
    } catch (error) {
      if (reply.sent) return;
      return sendServiceError(reply, error);
    }
  });
}

function noteView(note: { projectId: string; text: string; updatedAt: Date | string | null; revision: number }) {
  return { projectId: note.projectId, text: note.text, updatedAt: note.updatedAt, revision: note.revision };
}
