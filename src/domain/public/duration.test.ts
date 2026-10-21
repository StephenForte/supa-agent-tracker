import { describe, expect, it } from 'vitest';
import { formatDuration, formatJoined, formatStreak } from './duration';

describe('profile duration', () => {
  it('uses the largest whole unit at the minute, hour and day boundaries', () => {
    expect(formatDuration(59)).toBe('59s');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(3599)).toBe('59m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(86400)).toBe('1d');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(37 * 60)).toBe('37m');
    expect(formatDuration(4 * 3600)).toBe('4h');
    expect(formatDuration(2 * 86400)).toBe('2d');
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats streaks and joined days', () => {
    expect(formatStreak(102)).toBe('102d');
    expect(formatStreak(0)).toBe('0d');
    const now = Date.parse('2026-10-21T12:00:00.000Z');
    expect(formatJoined('2026-10-11T12:00:00.000Z', now)).toBe('Joined 10 days ago');
    expect(formatJoined('2026-10-20T12:00:00.000Z', now)).toBe('Joined 1 day ago');
    expect(formatJoined('2026-10-21T18:00:00.000Z', now)).toBe('Joined 0 days ago');
  });
});
