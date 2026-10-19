/** 3–32 chars, lowercase letters, digits and hyphens, starting and ending alphanumeric. */
export const PUBLIC_HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/** Latest runs returned for one owner's public page. A time window stays unbounded. */
export const PUBLIC_RUN_LIMIT = 200;

export const PUBLIC_RATE_LIMIT = 60;
export const PUBLIC_RATE_WINDOW_MS = 60_000;

export function normalizePublicHandle(value: string): string | null {
  const handle = value.trim().toLowerCase();
  return PUBLIC_HANDLE_PATTERN.test(handle) ? handle : null;
}

/** URL handles are matched case-insensitively and are not trimmed, so padding cannot probe a different shape. */
export function publicHandleFromParam(value: string): string | null {
  const handle = value.toLowerCase();
  return PUBLIC_HANDLE_PATTERN.test(handle) ? handle : null;
}
