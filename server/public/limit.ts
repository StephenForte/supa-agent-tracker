/** Fixed window per key. The first request opens the window; later requests in it share the count. */
export function createIpLimiter(max: number, windowMs: number) {
  const attempts = new Map<string, { count: number; expires: number }>();
  return function allowed(ip: string): boolean {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
    const current = attempts.get(ip);
    if ((current?.count ?? 0) >= max) return false;
    if (!current && attempts.size >= 10_000) return false;
    if (current) current.count += 1;
    else attempts.set(ip, { count: 1, expires: now + windowMs });
    return true;
  };
}
