import { describe, expect, it } from 'vitest';

import { activityAnchor, activityWindow, calendarDate, currentStreakDays, formatCalendarDate, harnessSeries, harnessWindow, longestStreakDays, shiftCalendarDate } from './stats.js';

const noon = new Date('2026-10-21T18:00:00.000Z');

describe('profile day and streak math', () => {
  it('places 2026-10-21T06:30Z on the previous Los Angeles date and the same UTC date', () => {
    const instant = new Date('2026-10-21T06:30:00.000Z');
    expect(formatCalendarDate(calendarDate(instant, 'America/Los_Angeles'))).toBe('2026-10-20');
    expect(formatCalendarDate(calendarDate(instant, 'UTC'))).toBe('2026-10-21');
  });

  it('keeps a streak that ends yesterday and drops it after a missed day', () => {
    expect(currentStreakDays(new Set(['2026-10-19', '2026-10-20']), 'UTC', noon)).toBe(2);
    expect(currentStreakDays(new Set(['2026-10-18', '2026-10-19']), 'UTC', noon)).toBe(0);
    expect(longestStreakDays(new Set(['2026-10-18', '2026-10-19']))).toBe(2);
    const early = new Date('2026-10-21T06:30:00.000Z');
    expect(currentStreakDays(new Set(['2026-10-20']), 'America/Los_Angeles', early)).toBe(1);
    expect(currentStreakDays(new Set(['2026-10-21']), 'America/Los_Angeles', early)).toBe(0);
    expect(currentStreakDays(new Set(['2026-10-21']), 'UTC', early)).toBe(1);
  });

  it('counts a 5-day run and a later 2-day run ending today', () => {
    const active = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-20', '2026-10-21']);
    expect(currentStreakDays(active, 'UTC', noon)).toBe(2);
    expect(longestStreakDays(active)).toBe(5);
  });

  it('builds a 365-day window ending on the owner-zone today, including across DST', () => {
    const veteran = new Date('2020-01-01T00:00:00.000Z');
    const utc = activityWindow(noon, 'UTC', calendarDate(veteran, 'UTC'));
    expect(utc.end).toBe('2026-10-21');
    expect(utc.start).toBe('2025-10-22');
    expect(utc.dates).toHaveLength(365);
    expect(new Set(utc.dates).size).toBe(365);
    expect(utc.dates[0]).toBe(utc.start);
    expect(utc.dates.at(-1)).toBe(utc.end);

    const spring = activityWindow(new Date('2026-03-10T12:00:00.000Z'), 'America/Los_Angeles', calendarDate(veteran, 'America/Los_Angeles'));
    expect(spring.end).toBe('2026-03-10');
    expect(spring.start).toBe('2025-03-11');
    expect(spring.dates).toHaveLength(365);
    expect(new Set(spring.dates).size).toBe(365);
    expect(spring.dates).toContain('2026-03-08');

    const fall = activityWindow(new Date('2026-11-02T12:00:00.000Z'), 'America/Los_Angeles', calendarDate(veteran, 'America/Los_Angeles'));
    expect(fall.end).toBe('2026-11-02');
    expect(fall.start).toBe('2025-11-03');
    expect(fall.dates).toHaveLength(365);
    expect(new Set(fall.dates).size).toBe(365);
    expect(fall.dates).toContain('2026-11-01');
    expect(harnessWindow(noon, 'America/Los_Angeles', calendarDate(veteran, 'America/Los_Angeles')).dates).toHaveLength(30);
  });

  it('sizes the heatmap to account age, from 7 days through 365, in the owner zone', () => {
    const threeDays = activityWindow(noon, 'UTC', calendarDate(new Date('2026-10-18T18:00:00.000Z'), 'UTC'));
    expect(threeDays.end).toBe('2026-10-21');
    expect(threeDays.start).toBe('2026-10-15');
    expect(threeDays.dates).toHaveLength(7);
    expect(new Set(threeDays.dates).size).toBe(7);

    const thirtyDays = activityWindow(noon, 'UTC', calendarDate(new Date('2026-09-21T18:00:00.000Z'), 'UTC'));
    expect(thirtyDays.start).toBe('2026-09-21');
    expect(thirtyDays.end).toBe('2026-10-21');
    expect(thirtyDays.dates).toHaveLength(31);

    const twoYears = activityWindow(noon, 'UTC', calendarDate(new Date('2024-10-21T18:00:00.000Z'), 'UTC'));
    expect(twoYears.start).toBe('2025-10-22');
    expect(twoYears.dates).toHaveLength(365);

    const joinedToday = activityWindow(noon, 'UTC', calendarDate(noon, 'UTC'));
    expect(joinedToday.start).toBe('2026-10-15');
    expect(joinedToday.dates).toHaveLength(7);

    const joinedAfterNow = activityWindow(noon, 'UTC', calendarDate(new Date('2026-10-22T14:00:00.000Z'), 'UTC'));
    expect(joinedAfterNow.start).toBe('2026-10-15');
    expect(joinedAfterNow.dates).toHaveLength(7);

    const joined = new Date('2026-10-21T06:30:00.000Z');
    const later = new Date('2026-11-20T18:00:00.000Z');
    const utc = activityWindow(later, 'UTC', calendarDate(joined, 'UTC'));
    const losAngeles = activityWindow(later, 'America/Los_Angeles', calendarDate(joined, 'America/Los_Angeles'));
    expect(utc.end).toBe('2026-11-20');
    expect(losAngeles.end).toBe('2026-11-20');
    expect(utc.start).toBe('2026-10-21');
    expect(losAngeles.start).toBe('2026-10-20');
    expect(utc.dates).toHaveLength(31);
    expect(losAngeles.dates).toHaveLength(32);

    const dstNow = new Date('2026-03-10T12:00:00.000Z');
    const dst = activityWindow(dstNow, 'America/Los_Angeles', calendarDate(new Date('2026-03-01T12:00:00.000Z'), 'America/Los_Angeles'));
    expect(dst.start).toBe('2026-03-01');
    expect(dst.end).toBe('2026-03-10');
    expect(dst.dates).toHaveLength(10);
    expect(new Set(dst.dates).size).toBe(10);
    expect(dst.dates).toContain('2026-03-08');
  });

  it('keeps the top 4 harnesses, breaks ties by name, labels a null harness Unknown, and folds the rest into Other', () => {
    const dates = ['2026-10-20', '2026-10-21'];
    const six = harnessSeries([
      { harness: 'n', day: dates[1]!, count: 10 },
      { harness: 'm', day: dates[1]!, count: 9 },
      { harness: 'b', day: dates[0]!, count: 8 },
      { harness: 'a', day: dates[1]!, count: 7 },
      { harness: 'z', day: dates[1]!, count: 2 },
      { harness: 'y', day: dates[0]!, count: 1 },
      { harness: 'quiet', day: dates[1]!, count: 0 },
    ], dates);
    expect(six.map((series) => series.harness)).toEqual(['n', 'm', 'b', 'a', 'Other']);
    expect(six[0]?.counts).toEqual([0, 10]);
    expect(six[4]?.counts).toEqual([1, 2]);
    expect(six.every((series) => series.counts.length === 2)).toBe(true);

    const tied = harnessSeries([
      { harness: 'bravo', day: dates[1]!, count: 5 },
      { harness: 'alpha', day: dates[1]!, count: 5 },
      { harness: null, day: dates[1]!, count: 9 },
    ], dates);
    expect(tied.map((series) => series.harness)).toEqual(['Unknown', 'alpha', 'bravo']);
  });

  it('folds harness names case-insensitively across the window and ranks on the folded total', () => {
    const dates = ['2026-10-20', '2026-10-21'];
    const production = harnessSeries([
      { harness: 'Cursor', day: dates[0]!, count: 10 },
      { harness: 'Cursor', day: dates[1]!, count: 3 },
      { harness: 'cursor', day: dates[1]!, count: 5 },
    ], dates);
    expect(production).toEqual([{ harness: 'Cursor', counts: [10, 8] }]);
    expect(production[0]?.counts.reduce((sum, count) => sum + count, 0)).toBe(18);

    const tiedSpelling = harnessSeries([
      { harness: 'cursor', day: dates[0]!, count: 2 },
      { harness: 'Cursor', day: dates[1]!, count: 2 },
    ], dates);
    expect(tiedSpelling).toEqual([{ harness: 'Cursor', counts: [2, 2] }]);

    const spaced = harnessSeries([
      { harness: ' Cursor ', day: dates[0]!, count: 3 },
      { harness: 'CURSOR', day: dates[1]!, count: 1 },
    ], dates);
    expect(spaced).toEqual([{ harness: 'Cursor', counts: [3, 1] }]);

    const blanks = harnessSeries([
      { harness: '', day: dates[0]!, count: 1 },
      { harness: '   ', day: dates[0]!, count: 2 },
      { harness: null, day: dates[1]!, count: 3 },
      { harness: 'Cursor', day: dates[1]!, count: 4 },
    ], dates);
    expect(blanks.map((series) => series.harness)).toEqual(['Unknown', 'Cursor']);
    expect(blanks[0]?.counts).toEqual([3, 3]);
    expect(blanks[1]?.counts).toEqual([0, 4]);

    // Delta is 4th only while Cursor and cursor are split at 6 each. Folded, Cursor is 12 and Delta is Other.
    const displaced = harnessSeries([
      { harness: 'Alpha', day: dates[1]!, count: 10 },
      { harness: 'Bravo', day: dates[1]!, count: 9 },
      { harness: 'Charlie', day: dates[1]!, count: 8 },
      { harness: 'Delta', day: dates[1]!, count: 7 },
      { harness: 'Cursor', day: dates[0]!, count: 4 },
      { harness: 'Cursor', day: dates[1]!, count: 2 },
      { harness: 'cursor', day: dates[1]!, count: 6 },
    ], dates);
    expect(displaced.map((series) => series.harness)).toEqual(['Cursor', 'Alpha', 'Bravo', 'Charlie', 'Other']);
    expect(displaced[0]?.counts).toEqual([4, 8]);
    expect(displaced[4]?.counts).toEqual([0, 7]);
  });
});


describe('D-046 shared activity period', () => {
  const today = calendarDate(noon, 'UTC');
  const day = (offset: number) => formatCalendarDate(shiftCalendarDate(today, offset));
  const daily = (start: number, end = 0) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

  it.each([
    { name: 'joined three days ago', joined: -3, active: daily(-3), anchor: -3, chart: 7, heatmap: 7 },
    { name: 'joined yesterday', joined: -1, active: [-1, 0], anchor: -1, chart: 7, heatmap: 7 },
    { name: 'two months of steady activity', joined: -60, active: daily(-60), anchor: -60, chart: 30, heatmap: 61 },
    { name: 'two years of steady activity', joined: -730, active: daily(-730), anchor: -730, chart: 30, heatmap: 365 },
    { name: 'restart today after exactly 30 inactive days', joined: -100, active: [-31, 0], anchor: 0, chart: 7, heatmap: 7 },
    { name: 'restart today after 31 inactive days', joined: -100, active: [-32, 0], anchor: 0, chart: 7, heatmap: 7 },
    { name: '29 inactive days do not restart', joined: -100, active: [-30, 0], anchor: -30, chart: 30, heatmap: 31 },
    { name: 'resumed for 12 inclusive days after a 40-day break', joined: -100, active: [-52, -11, 0], anchor: -11, chart: 12, heatmap: 12 },
    { name: 'resumed for 50 inclusive days after a 40-day break', joined: -200, active: [-90, ...daily(-49)], anchor: -49, chart: 30, heatmap: 50 },
    { name: 'last activity 45 days ago', joined: -100, active: [-45], anchor: 0, chart: 7, heatmap: 7 },
    { name: 'last activity exactly 29 days ago', joined: -100, active: daily(-60, -29), anchor: -60, chart: 30, heatmap: 61 },
    { name: 'last activity exactly 30 days ago', joined: -100, active: [-30], anchor: 0, chart: 7, heatmap: 7 },
    { name: 'last activity 31 days ago', joined: -100, active: [-31], anchor: 0, chart: 7, heatmap: 7 },
    { name: 'no runs', joined: -100, active: [], anchor: 0, chart: 7, heatmap: 7 },
    { name: 'join date wins over earlier imported activity', joined: -10, active: daily(-20), anchor: -10, chart: 11, heatmap: 11 },
    { name: 'latest of several periods wins, independent of input order', joined: -200, active: [0, -100, -50, -49, -10], anchor: -10, chart: 11, heatmap: 11 },
    { name: 'future runs cannot keep an idle account active', joined: -100, active: [-45, 1], anchor: 0, chart: 7, heatmap: 7 },
  ])('$name', ({ joined, active, anchor: expectedAnchor, chart, heatmap }) => {
    const activeDays = new Set(active.map(day));
    const original = [...activeDays];
    const anchor = activityAnchor(noon, 'UTC', new Date(`${day(joined)}T12:00:00Z`), activeDays);
    expect(formatCalendarDate(anchor)).toBe(day(expectedAnchor));
    for (const [window, length] of [[harnessWindow(noon, 'UTC', anchor), chart], [activityWindow(noon, 'UTC', anchor), heatmap]] as const) {
      expect(window.end).toBe(day(0));
      expect(window.start).toBe(day(-(length - 1)));
      expect(window.dates).toHaveLength(length);
      expect(new Set(window.dates).size).toBe(length);
      expect(window.dates.at(0)).toBe(window.start);
      expect(window.dates.at(-1)).toBe(window.end);
    }
    expect([...activeDays]).toEqual(original);
  });

  it('a 06:30Z run changes the anchor at the owner-zone idle boundary', () => {
    const run = new Date('2026-10-21T06:30:00Z');
    const now = new Date('2026-11-19T18:00:00Z');
    const joined = new Date('2020-01-01T00:00:00Z');
    for (const [zone, expected, length] of [['UTC', '2026-10-21', 30], ['America/Los_Angeles', '2026-11-19', 7]] as const) {
      const active = new Set([formatCalendarDate(calendarDate(run, zone))]);
      const anchor = activityAnchor(now, zone, joined, active);
      expect(formatCalendarDate(anchor)).toBe(expected);
      expect(harnessWindow(now, zone, anchor).dates).toHaveLength(length);
      expect(activityWindow(now, zone, anchor).dates).toHaveLength(length);
    }
  });

  it.each(['2026-03-10T18:00:00Z', '2026-11-02T18:00:00Z', '2024-03-02T18:00:00Z', '2026-01-03T18:00:00Z'])(
    'uses calendar gaps through DST, leap days, and year boundaries: %s', (instant) => {
      const now = new Date(instant);
      const end = calendarDate(now, 'America/Los_Angeles');
      const first = shiftCalendarDate(end, -11);
      const active = new Set([formatCalendarDate(shiftCalendarDate(first, -41)), formatCalendarDate(first), formatCalendarDate(end)]);
      const anchor = activityAnchor(now, 'America/Los_Angeles', new Date('2020-01-01T00:00:00Z'), active);
      expect(anchor).toEqual(first);
      expect(harnessWindow(now, 'America/Los_Angeles', anchor).dates).toHaveLength(12);
      expect(activityWindow(now, 'America/Los_Angeles', anchor).dates).toHaveLength(12);
    },
  );
});
