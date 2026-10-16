import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { REQUEST_ID_PATTERN } from './conventions.js';

export function resolveRequestId(req: IncomingMessage): string {
  const header = req.headers['x-request-id'];
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header)) return header;
  return randomUUID();
}
