import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { JSON_BODY_LIMIT_BYTES, apiError, errorCodes } from './errors.js';
import { createLoggerOptions } from './logging.js';
import { resolveRequestId } from './request-id.js';
import { registerRoutes, type RouteDeps } from './routes.js';
import type { AppConfig } from '../config.js';

export interface BuildAppOptions extends RouteDeps {
  config: AppConfig;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: JSON_BODY_LIMIT_BYTES,
    logger: options.logger ?? (options.config.nodeEnv === 'test' ? false : createLoggerOptions()),
    genReqId: resolveRequestId,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = statusOf(error);
    const code = codeOf(error);
    if (statusCode === 413 || code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send(apiError(errorCodes.payload_too_large, 'JSON body exceeds the size limit'));
    }
    if (statusCode === 400 || code === 'FST_ERR_CTP_INVALID_JSON_BODY' || hasValidation(error)) {
      return reply.code(400).send(apiError(errorCodes.validation_error, 'Request could not be processed'));
    }
    if (statusCode >= 500) {
      request.log.error({ err: safeLogError(error) }, 'request failed');
      return reply.code(500).send(apiError(errorCodes.internal_error, 'Internal server error'));
    }
    return reply.code(statusCode).send(apiError(codeForStatus(statusCode), messageForStatus(statusCode)));
  });

  await registerRoutes(app, options);
  return app;
}

function messageForStatus(statusCode: number): string {
  if (statusCode === 404) return 'Not found';
  if (statusCode === 413) return 'JSON body exceeds the size limit';
  return 'Request could not be processed';
}

function codeForStatus(statusCode: number): string {
  if (statusCode === 401) return errorCodes.unauthenticated;
  if (statusCode === 403) return errorCodes.forbidden;
  if (statusCode === 404) return errorCodes.not_found;
  if (statusCode === 409) return errorCodes.conflict;
  if (statusCode === 413) return errorCodes.payload_too_large;
  return errorCodes.validation_error;
}

function statusOf(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return 500;
}

function codeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function hasValidation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error && error.validation != null;
}

function safeLogError(error: unknown): Error {
  if (error instanceof Error && !error.message.includes('://')) return error;
  return new Error('request failed');
}
