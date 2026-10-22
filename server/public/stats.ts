export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface DayWindow {
  start: string;
  end: string;
  dates: string[];
}

export interface HarnessDayCount {
  harness: string | null;
  day: string;
  count: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  formatters.set(timeZone, created);
  return created;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((item) => item.type === type)?.value;
  if (!value) throw new Error('calendar date is missing a part');
  return Number(value);
}

/** Calendar date of an instant in a named zone. Does not use the process timezone. */
export function calendarDate(instant: Date, timeZone: string): CalendarDate {
  const parts = formatter(timeZone).formatToParts(instant);
  return { year: part(parts, 'year'), month: part(parts, 'month'), day: part(parts, 'day') };
}

export function formatCalendarDate(date: CalendarDate): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${String(date.year).padStart(4, '0')}-${month}-${day}`;
}

/** Shifts a calendar date by whole days. UTC noon math, so DST cannot drop or repeat a date. */
export function shiftCalendarDate(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export function parseCalendarDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('active day is not a calendar date');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function datesEnding(end: CalendarDate, length: number): string[] {
  const dates: string[] = [];
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    dates.push(formatCalendarDate(shiftCalendarDate(end, -offset)));
  }
  return dates;
}

function windowEnding(now: Date, timeZone: string, length: number): DayWindow {
  const dates = datesEnding(calendarDate(now, timeZone), length);
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (!start || !end) throw new Error('calendar window is empty');
  return { start, end, dates };
}

export function activityWindow(now: Date, timeZone: string): DayWindow {
  return windowEnding(now, timeZone, 365);
}

export function harnessWindow(now: Date, timeZone: string): DayWindow {
  return windowEnding(now, timeZone, 30);
}

export function countsForDates(dayCounts: ReadonlyMap<string, number>, dates: readonly string[]): number[] {
  return dates.map((day) => dayCounts.get(day) ?? 0);
}

/** Consecutive active days ending today, or ending yesterday when today is empty, otherwise 0. */
export function currentStreakDays(activeDays: ReadonlySet<string>, timeZone: string, now: Date): number {
  const today = calendarDate(now, timeZone);
  const todayKey = formatCalendarDate(today);
  let cursor: CalendarDate | null = null;
  if (activeDays.has(todayKey)) cursor = today;
  else if (activeDays.has(formatCalendarDate(shiftCalendarDate(today, -1)))) cursor = shiftCalendarDate(today, -1);
  if (!cursor) return 0;
  let streak = 0;
  while (activeDays.has(formatCalendarDate(cursor))) {
    streak += 1;
    cursor = shiftCalendarDate(cursor, -1);
  }
  return streak;
}

export function longestStreakDays(activeDays: ReadonlySet<string>): number {
  const ordered = [...activeDays].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of ordered) {
    const follows = previous !== null && formatCalendarDate(shiftCalendarDate(parseCalendarDate(previous), 1)) === day;
    run = follows ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }
  return longest;
}

function compareName(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

interface FoldedHarness {
  total: number;
  byDay: Map<string, number>;
  spellings: Map<string, number>;
}

/** Blank, empty, and whitespace-only reports share one group. The label is the mapped name, not the raw spaces. */
function foldedHarness(raw: string | null): { key: string; label: string } {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return { key: 'unknown', label: 'Unknown' };
  return { key: trimmed.toLowerCase(), label: trimmed };
}

/** Most-used trimmed spelling in the window. A tie uses plain `<`, so "Cursor" beats "cursor". */
function preferredSpelling(spellings: ReadonlyMap<string, number>): string {
  let chosen: string | null = null;
  let chosenCount = -1;
  for (const [label, count] of spellings) {
    if (chosen === null || count > chosenCount || (count === chosenCount && label < chosen)) {
      chosen = label;
      chosenCount = count;
    }
  }
  if (chosen === null) throw new Error('harness group has no spelling');
  return chosen;
}

/** Top 4 harnesses by folded total (tie → label ascending), then Other. Fold is trim + toLowerCase across the window; null and blank are Unknown. */
export function harnessSeries(rows: readonly HarnessDayCount[], dates: readonly string[]): { harness: string; counts: number[] }[] {
  const groups = new Map<string, FoldedHarness>();
  for (const row of rows) {
    if (row.count <= 0) continue;
    const { key, label } = foldedHarness(row.harness);
    const group = groups.get(key) ?? { total: 0, byDay: new Map<string, number>(), spellings: new Map<string, number>() };
    group.total += row.count;
    group.byDay.set(row.day, (group.byDay.get(row.day) ?? 0) + row.count);
    group.spellings.set(label, (group.spellings.get(label) ?? 0) + row.count);
    groups.set(key, group);
  }
  const ranked = [...groups.values()]
    .filter((group) => group.total > 0)
    .map((group) => ({ label: preferredSpelling(group.spellings), total: group.total, byDay: group.byDay }))
    .sort((left, right) => right.total - left.total || compareName(left.label, right.label));
  const series = ranked.slice(0, 4).map((group) => ({
    harness: group.label,
    counts: dates.map((day) => group.byDay.get(day) ?? 0),
  }));
  const rest = ranked.slice(4);
  if (rest.length > 0) {
    const counts = dates.map((day) => rest.reduce((sum, group) => sum + (group.byDay.get(day) ?? 0), 0));
    if (counts.some((count) => count > 0)) series.push({ harness: 'Other', counts });
  }
  return series;
}
