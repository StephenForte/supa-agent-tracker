import { calendarDaysInclusive, formatCalendarLabel, formatMonthLabel, mondayIndex } from './calendar';

/** 0 = empty. 1–4 are quartiles of the nonzero counts. A count equal to a boundary stays in the lower level. */
export function heatmapLevels(counts: readonly number[]): number[] {
  const nonzero = counts.filter(count => count > 0).sort((left, right) => left - right);
  if (nonzero.length === 0) return counts.map(() => 0);
  const quartile = (fraction: number) => {
    const index = (nonzero.length - 1) * fraction;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const low = nonzero[lower] ?? 0;
    const high = nonzero[upper] ?? low;
    return low + (high - low) * (index - lower);
  };
  const first = quartile(0.25);
  const second = quartile(0.5);
  const third = quartile(0.75);
  return counts.map(count => {
    if (count <= 0) return 0;
    if (count <= first) return 1;
    if (count <= second) return 2;
    if (count <= third) return 3;
    return 4;
  });
}

export function activityCellLabel(ymd: string, count: number): string {
  const runs = count === 1 ? '1 run' : `${count} runs`;
  return `${formatCalendarLabel(ymd)}: ${runs}`;
}

export interface ActivityCell {
  date: string;
  count: number;
  level: number;
  label: string;
  column: number;
  row: number;
}

export interface ActivityMonth { label: string; column: number }

export interface ActivityGrid {
  cells: ActivityCell[];
  months: ActivityMonth[];
  columns: number;
  leadingBlanks: number;
}

export function buildActivityGrid(activity: { start: string; end: string; counts: readonly number[] }): ActivityGrid {
  const dates = calendarDaysInclusive(activity.start, activity.end);
  const levels = heatmapLevels(dates.map((_, index) => activity.counts[index] ?? 0));
  const leadingBlanks = dates[0] ? mondayIndex(dates[0]) : 0;
  const cells = dates.map((date, index) => {
    const count = activity.counts[index] ?? 0;
    const offset = index + leadingBlanks;
    return {
      date,
      count,
      level: levels[index] ?? 0,
      label: activityCellLabel(date, count),
      column: Math.floor(offset / 7),
      row: offset % 7,
    };
  });
  const monthStarts: ActivityMonth[] = [];
  let seen = '';
  for (const cell of cells) {
    const key = cell.date.slice(0, 7);
    if (key === seen) continue;
    seen = key;
    monthStarts.push({ label: formatMonthLabel(cell.date), column: cell.column });
  }
  // Drop a label that would sit fewer than three columns before the next one.
  // A partial first month otherwise reads as one word (OctNov). Cells stay put.
  const months = monthStarts.filter((month, index) => {
    const next = monthStarts[index + 1];
    return next === undefined || next.column - month.column >= 3;
  });
  const columns = cells.length === 0 ? 0 : cells[cells.length - 1]!.column + 1;
  return { cells, months, columns, leadingBlanks };
}
