/** Calendar dates are YYYY-MM-DD strings. All math uses Date.UTC so a browser west of UTC cannot slide the grid back a day. */

export function parseYmd(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addCalendarDays(ymd: string, days: number): string {
  const parts = parseYmd(ymd);
  if (!parts) throw new Error(`Invalid calendar date ${ymd}`);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Inclusive. Stops at `end`. A non-leap year that starts the day after `end` last year is 365 dates. */
export function calendarDaysInclusive(start: string, end: string): string[] {
  if (!parseYmd(start) || !parseYmd(end) || start > end) return [];
  const dates: string[] = [];
  let cursor = start;
  for (let guard = 0; guard < 4000; guard += 1) {
    dates.push(cursor);
    if (cursor === end) return dates;
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

/** Monday = 0 … Sunday = 6, from the UTC weekday of the calendar date. */
export function mondayIndex(ymd: string): number {
  const parts = parseYmd(ymd);
  if (!parts) throw new Error(`Invalid calendar date ${ymd}`);
  const sundayBased = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return (sundayBased + 6) % 7;
}

export function formatCalendarLabel(ymd: string): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function formatMonthLabel(ymd: string): string {
  const parts = parseYmd(ymd);
  if (!parts) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}
