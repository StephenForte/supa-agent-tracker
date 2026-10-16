import type { FastifyServerOptions } from 'fastify';

/**
 * Fastify 5's built-in request serializer omits headers. These paths still censor
 * them if a later change logs the request, a child binding, or a header object.
 * The serializers below also copy headers with the secret ones already replaced.
 */
export const logRedactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers.authorization',
  'res.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  '*.authorization',
  '*.cookie',
  '*.["set-cookie"]',
] as const;

export const logRedactCensor = '[Redacted]';

const secretHeaders = new Set(['authorization', 'cookie', 'set-cookie']);

export function redactHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (headers === undefined) return undefined;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    copy[key] = secretHeaders.has(key.toLowerCase()) ? logRedactCensor : value;
  }
  return copy;
}

interface RequestLogShape {
  method?: string;
  url?: string;
  host?: string;
  ip?: string;
  headers?: Record<string, unknown>;
}

interface ReplyLogShape {
  statusCode?: number;
  getHeaders?: () => Record<string, unknown>;
}

export function createLoggerOptions(stream?: { write(msg: string): void }): NonNullable<FastifyServerOptions['logger']> {
  return {
    level: 'info',
    redact: {
      paths: [...logRedactPaths],
      censor: logRedactCensor,
    },
    serializers: {
      req(request: RequestLogShape) {
        return {
          method: request.method,
          url: request.url,
          host: request.host,
          remoteAddress: request.ip,
          headers: redactHeaders(request.headers),
        };
      },
      res(reply: ReplyLogShape) {
        return {
          statusCode: reply.statusCode,
          headers: redactHeaders(reply.getHeaders?.()),
        };
      },
    },
    ...(stream ? { stream } : {}),
  };
}
