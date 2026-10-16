import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { registerUserApiRoutes } from '../api/user-routes.js';
import { registerAuthRoutes } from '../auth/routes.js';
import { apiError, errorCodes } from './errors.js';
import { migrationsAreCurrent } from '../db/migrate.js';
import { registerMcpRoutes } from '../mcp/routes.js';
import { registerStepsAndNotesRoutes } from '../steps/routes.js';
import { registerSpa } from './spa.js';

export interface RouteDeps {
  pool: pg.Pool;
  migrationsDir: string;
  spaRoot: string;
}

export async function registerRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  registerHealthRoutes(app, deps);
  await registerApiRouter(app);
  await registerSpa(app, deps.spaRoot);

  // Wave-3 tasks append exactly one registration line each:
  await registerAuthRoutes(app, deps);
  await registerMcpRoutes(app, deps);
  await registerStepsAndNotesRoutes(app, deps);
  await registerUserApiRoutes(app, deps);
}

function registerHealthRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get('/health', async () => ({ status: 'ok' as const }));

  app.get('/ready', async (_request, reply) => {
    try {
      await deps.pool.query('SELECT 1');
    } catch {
      return reply.code(503).send(apiError(errorCodes.database_unreachable, 'Database is not reachable'));
    }
    try {
      const status = await migrationsAreCurrent(deps.pool, deps.migrationsDir);
      if (!status.current) {
        return reply.code(503).send(apiError(errorCodes.migrations_pending, 'Database migrations are not current'));
      }
    } catch {
      return reply.code(503).send(apiError(errorCodes.database_unreachable, 'Database is not reachable'));
    }
    return { status: 'ready' as const };
  });
}

async function registerApiRouter(app: FastifyInstance): Promise<void> {
  await app.register(
    async function apiRouter(api) {
      api.setNotFoundHandler((_request, reply) => {
        return reply.code(404).send(apiError(errorCodes.not_found, 'Not found'));
      });
    },
    { prefix: '/api' },
  );
}
