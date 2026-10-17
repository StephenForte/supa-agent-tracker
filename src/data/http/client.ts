import type { WriteResult } from '../../domain/types.js';
export type Fetcher = typeof globalThis.fetch;
export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly current?: unknown) { super(message); }
}
export class SessionExpiredError extends HttpError { constructor() { super(401, 'Your session has expired. Please log in.'); } }
export function createHttpClient(fetcher: Fetcher = globalThis.fetch.bind(globalThis), onUnauthorized: () => void = () => {}) {
  let sessionEpoch = 0;
  const unauthorizedListeners = new Set<(path: string) => void>();
  return {
    onUnauthorized(listener: (path: string) => void) { unauthorizedListeners.add(listener); return () => { unauthorizedListeners.delete(listener); }; },
    async request<T>(path: string, method = 'GET', body?: unknown, notifyUnauthorized = true): Promise<T> {
      const requestEpoch = sessionEpoch;
      if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('API requests must be same-origin');
      // Retry only transport failures, with the exact serialized body and request_id.
      const init = { method, credentials: 'same-origin' as const, cache: 'no-store' as const,
        headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
      let response: Response;
      try { response = await fetcher(path, init); }
      catch { response = await fetcher(path, init); }
      const value = await response.json() as { error?: { message?: string; details?: { current?: unknown } } };
      if (response.ok) {
        if (method === 'POST' && ['/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/change-password', '/api/auth/reset-password'].includes(path)) sessionEpoch++;
        return value as T;
      }
      if (response.status === 401) { if (notifyUnauthorized && requestEpoch === sessionEpoch) { unauthorizedListeners.forEach(listener => listener(path)); onUnauthorized(); } throw new SessionExpiredError(); }
      const message = response.status >= 500 ? 'The server could not complete the request. Please try again.'
        : response.status === 429 ? 'Too many requests. Please try again shortly.'
        : value?.error?.message ?? 'Request could not be processed';
      throw new HttpError(response.status, message, value?.error?.details?.current);
    },
  };
}
export type HttpClient = ReturnType<typeof createHttpClient>;
export async function write<T>(client: HttpClient, path: string, method: string, body: unknown): Promise<WriteResult<T>> {
  try { return { status: 'saved', value: await client.request<T>(path, method, body) }; }
  catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 404) return { status: 'not_found' };
      if (error.status === 400) return { status: 'invalid', message: error.message };
      if (error.status === 409 && error.current !== undefined) return { status: 'conflict', current: error.current as T };
    }
    throw error;
  }
}
export async function nullable<T>(read: () => Promise<T>): Promise<T | null> {
  try { return await read(); } catch (error) { if (error instanceof HttpError && error.status === 404) return null; throw error; }
}
export const actionFields = () => ({ request_id: globalThis.crypto.randomUUID() });
export const segment = (value: string) => encodeURIComponent(value);
export async function pages<T>(client: HttpClient, path: string): Promise<T[]> {
  const items: T[] = []; let cursor: string | null = null; const seen = new Set<string>();
  do {
    const page: { items: T[]; nextCursor: string | null } = await client.request(`${path}${cursor === null ? '' : `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`}`);
    items.push(...page.items); cursor = page.nextCursor;
    if (cursor !== null) { if (seen.has(cursor)) throw new Error('The server returned a repeated page cursor'); seen.add(cursor); }
  } while (cursor !== null);
  return items;
}
