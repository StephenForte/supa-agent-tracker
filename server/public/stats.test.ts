import { describe, expect, it } from 'vitest';

import { activityWindow, calendarDate, currentStreakDays, formatCalendarDate, harnessSeries, harnessWindow, longestStreakDays } from './stats.js';

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
    const utc = activityWindow(noon, 'UTC', veteran);
    expect(utc.end).toBe('2026-10-21');
    expect(utc.start).toBe('2025-10-22');
    expect(utc.dates).toHaveLength(365);
    expect(new Set(utc.dates).size).toBe(365);
    expect(utc.dates[0]).toBe(utc.start);
    expect(utc.dates.at(-1)).toBe(utc.end);

    const spring = activityWindow(new Date('2026-03-10T12:00:00.000Z'), 'America/Los_Angeles', veteran);
    expect(spring.end).toBe('2026-03-10');
    expect(spring.start).toBe('2025-03-11');
    expect(spring.dates).toHaveLength(365);
    expect(new Set(spring.dates).size).toBe(365);
    expect(spring.dates).toContain('2026-03-08');

    const fall = activityWindow(new Date('2026-11-02T12:00:00.000Z'), 'America/Los_Angeles', veteran);
    expect(fall.end).toBe('2026-11-02');
    expect(fall.start).toBe('2025-11-03');
    expect(fall.dates).toHaveLength(365);
    expect(new Set(fall.dates).size).toBe(365);
    expect(fall.dates).toContain('2026-11-01');
    expect(harnessWindow(noon, 'America/Los_Angeles').dates).toHaveLength(30);
  });

  it('sizes the heatmap to account age, from 7 days through 365, in the owner zone', () => {
    const threeDays = activityWindow(noon, 'UTC', new Date('2026-10-18T18:00:00.000Z'));
    expect(threeDays.end).toBe('2026-10-21');
    expect(threeDays.start).toBe('2026-10-15');
    expect(threeDays.dates).toHaveLength(7);
    expect(new Set(threeDays.dates).size).toBe(7);

    const thirtyDays = activityWindow(noon, 'UTC', new Date('2026-09-21T18:00:00.000Z'));
    expect(thirtyDays.start).toBe('2026-09-21');
    expect(thirtyDays.end).toBe('2026-10-21');
    expect(thirtyDays.dates).toHaveLength(31);

    const twoYears = activityWindow(noon, 'UTC', new Date('2024-10-21T18:00:00.000Z'));
    expect(twoYears.start).toBe('2025-10-22');
    expect(twoYears.dates).toHaveLength(365);

    const joinedToday = activityWindow(noon, 'UTC', noon);
    expect(joinedToday.start).toBe('2026-10-15');
    expect(joinedToday.dates).toHaveLength(7);

    const joinedAfterNow = activityWindow(noon, 'UTC', new Date('2026-10-22T14:00:00.000Z'));
    expect(joinedAfterNow.start).toBe('2026-10-15');
    expect(joinedAfterNow.dates).toHaveLength(7);

    const joined = new Date('2026-10-21T06:30:00.000Z');
    const later = new Date('2026-11-20T18:00:00.000Z');
    const utc = activityWindow(later, 'UTC', joined);
    const losAngeles = activityWindow(later, 'America/Los_Angeles', joined);
    expect(utc.end).toBe('2026-11-20');
    expect(losAngeles.end).toBe('2026-11-20');
    expect(utc.start).toBe('2026-10-21');
    expect(losAngeles.start).toBe('2026-10-20');
    expect(utc.dates).toHaveLength(31);
    expect(losAngeles.dates).toHaveLength(32);

    const dstNow = new Date('2026-03-10T12:00:00.000Z');
    const dst = activityWindow(dstNow, 'America/Los_Angeles', new Date('2026-03-01T12:00:00.000Z'));
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
