import { describe, expect, it } from 'vitest';
import { calendarDaysInclusive } from './calendar';
import { activityCellLabel, buildActivityGrid, heatmapLevels } from './heatmap';

describe('activity heatmap', () => {
  it('keeps every cell at level 0 when nothing happened', () => {
    expect(heatmapLevels([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('assigns quartile levels and keeps a value on the boundary in the lower level', () => {
    expect(heatmapLevels([0, 1, 2, 3, 4])).toEqual([0, 1, 2, 3, 4]);
    expect(heatmapLevels([10, 10, 10, 40])).toEqual([1, 1, 1, 4]);
  });

  it('labels the last cell with activity.end and places Monday in the first row', () => {
    const end = '2026-10-21';
    const start = '2025-10-22';
    const counts = Array.from({ length: 365 }, (_, index) => index === 364 ? 4 : 0);
    const grid = buildActivityGrid({ start, end, counts });
    expect(grid.cells).toHaveLength(365);
    expect(grid.cells.at(-1)).toMatchObject({ date: end, row: 2, label: 'Oct 21, 2026: 4 runs' });
    expect(grid.cells.find(cell => cell.date === '2026-10-19')).toMatchObject({ row: 0 });
    expect(activityCellLabel('2026-10-03', 1)).toBe('Oct 3, 2026: 1 run');
    const localLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date('2026-10-21'));
    if (localLabel !== 'Oct 21, 2026') expect(grid.cells.at(-1)?.label.startsWith(localLabel)).toBe(false);
  });

  it('keeps 365 cells across a daylight-saving change', () => {
    const start = '2025-10-22';
    const end = '2026-10-21';
    expect(calendarDaysInclusive(start, end)).toHaveLength(365);
    const grid = buildActivityGrid({ start, end, counts: Array(365).fill(1) });
    expect(grid.cells).toHaveLength(365);
    expect(grid.cells.filter(cell => cell.date === '2026-03-08')).toHaveLength(1);
    expect(grid.cells.filter(cell => cell.date === '2025-11-02')).toHaveLength(1);
    expect(grid.months.map(month => month.label)).toContain('Oct');
    expect(new Set(grid.months.map(month => month.column)).size).toBe(grid.months.length);
  });

  it('drops a month label fewer than three columns before the next one', () => {
    const grid = buildActivityGrid({ start: '2025-10-22', end: '2026-10-21', counts: Array(365).fill(0) });
    expect(grid.months[0]).toEqual({ label: 'Nov', column: 1 });
    expect(grid.months.some(month => month.label === 'Oct' && month.column === 0)).toBe(false);
    expect(grid.months.at(-1)).toEqual({ label: 'Oct', column: grid.cells.find(cell => cell.date === '2026-10-01')?.column });
    expect(grid.cells.find(cell => cell.date === '2025-11-01')).toMatchObject({ column: 1 });
    expect(grid.cells).toHaveLength(365);
    const partial = buildActivityGrid({ start: '2025-01-13', end: '2025-02-28', counts: Array(47).fill(0) });
    expect(partial.months[0]).toEqual({ label: 'Feb', column: 2 });
    expect(partial.months.some(month => month.label === 'Jan')).toBe(false);
    expect(partial.cells[0]).toMatchObject({ date: '2025-01-13', column: 0 });
    expect(partial.cells.find(cell => cell.date === '2025-02-01')).toMatchObject({ column: 2 });
  });

  it('keeps a month label that starts on the 1st or sits three columns before the next', () => {
    const opened = buildActivityGrid({ start: '2025-10-01', end: '2025-11-30', counts: Array(61).fill(0) });
    expect(opened.months[0]).toEqual({ label: 'Oct', column: 0 });
    expect(opened.months[1]).toEqual({ label: 'Nov', column: 4 });
    expect(opened.cells[0]).toMatchObject({ date: '2025-10-01', column: 0 });
    expect(opened.cells.find(cell => cell.date === '2025-11-01')).toMatchObject({ column: 4 });
    const exact = buildActivityGrid({ start: '2025-01-06', end: '2025-02-28', counts: Array(54).fill(0) });
    expect(exact.months[0]).toEqual({ label: 'Jan', column: 0 });
    expect(exact.months[1]).toEqual({ label: 'Feb', column: 3 });
    expect(exact.cells.find(cell => cell.date === '2025-02-01')).toMatchObject({ column: 3 });
  });
});
