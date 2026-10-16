export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export class PaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaginationError';
  }
}

export interface PageQuery {
  cursor: string | null;
  limit: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Reads ?cursor=&limit=. limit defaults to 50 and is clamped to 100.
 * Callers fetch limit + 1 rows and pass them to pageItems.
 */
export function parsePageQuery(query: { cursor?: unknown; limit?: unknown }): PageQuery {
  return {
    cursor: parseCursor(query.cursor),
    limit: parseLimit(query.limit),
  };
}

export function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === '') return DEFAULT_PAGE_LIMIT;
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) {
    throw new PaginationError('limit must be a positive integer');
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new PaginationError('limit must be a positive integer');
  }
  return Math.min(value, MAX_PAGE_LIMIT);
}

export function parseCursor(raw: unknown): string | null {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 512) {
    throw new PaginationError('cursor is invalid');
  }
  return raw;
}

/** `rows` is the limit+1 fetch. nextCursor is null when the extra row is absent. */
export function pageItems<T>(rows: readonly T[], limit: number, cursorOf: (item: T) => string): Page<T> {
  if (rows.length <= limit) return { items: [...rows], nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  if (last === undefined) return { items: [], nextCursor: null };
  return { items, nextCursor: cursorOf(last) };
}
