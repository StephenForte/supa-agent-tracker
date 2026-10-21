/** Largest whole unit, the way a public profile states a run length: 45s, 37m, 4h, 2d. */
export function formatDuration(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (whole >= 86_400) return `${Math.floor(whole / 86_400)}d`;
  if (whole >= 3_600) return `${Math.floor(whole / 3_600)}h`;
  if (whole >= 60) return `${Math.floor(whole / 60)}m`;
  return `${whole}s`;
}

export function formatStreak(days: number): string {
  const whole = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  return `${whole}d`;
}

export function formatJoined(joinedAt: string, now: number): string {
  const elapsed = now - Date.parse(joinedAt);
  const days = Number.isFinite(elapsed) && elapsed > 0 ? Math.floor(elapsed / 86_400_000) : 0;
  return `Joined ${days} ${days === 1 ? 'day' : 'days'} ago`;
}
