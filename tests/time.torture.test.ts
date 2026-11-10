import { describe, it, expect } from 'vitest';
import { formatClock, clockParts } from '@/clock/clockFormat';
import { parseDateKey, toDateKey, addDays, daysInMonth, relativeDayLabel, msUntilNextBoundary, formatClockTime, combineDateTime, formatHHMM, parseHHMM, startOfDay, isSameDay } from '@/utils/time';
import { nextOccurrence, occurrenceOnDay } from '@/reminders/reminderLogic';
import { reminder } from './helpers';

describe('clock formatting at midnight and noon', () => {
  it('12-hour', () => {
    expect(formatClock(new Date(2026, 0, 1, 0, 0, 0), '12h', false)).toBe('12:00 AM');
    expect(formatClock(new Date(2026, 0, 1, 0, 59, 59), '12h', true)).toBe('12:59:59 AM');
    expect(formatClock(new Date(2026, 0, 1, 11, 59), '12h', false)).toBe('11:59 AM');
    expect(formatClock(new Date(2026, 0, 1, 12, 0), '12h', false)).toBe('12:00 PM');
    expect(formatClock(new Date(2026, 0, 1, 12, 1), '12h', false)).toBe('12:01 PM');
    expect(formatClock(new Date(2026, 0, 1, 23, 59), '12h', false)).toBe('11:59 PM');
    expect(clockParts(new Date(2026, 0, 1, 0, 5), '12h').hours).toBe('12');
  });
  it('24-hour', () => {
    expect(formatClock(new Date(2026, 0, 1, 0, 0), '24h', false)).toBe('00:00');
    expect(formatClock(new Date(2026, 0, 1, 12, 0), '24h', false)).toBe('12:00');
    expect(formatClock(new Date(2026, 0, 1, 23, 59, 5), '24h', true)).toBe('23:59:05');
    expect(formatClockTime('00:00', '12h')).toBe('12:00 AM');
    expect(formatClockTime('12:00', '12h')).toBe('12:00 PM');
    expect(formatClockTime('12:30', '24h')).toBe('12:30');
  });
});

describe('calendar arithmetic at month and year boundaries', () => {
  it('addDays crosses months and years', () => {
    expect(toDateKey(addDays(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
    expect(toDateKey(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01');
    expect(toDateKey(addDays(new Date(2027, 0, 1), -1))).toBe('2026-12-31');
    expect(toDateKey(addDays(new Date(2028, 1, 28), 1))).toBe('2028-02-29');
    expect(toDateKey(addDays(new Date(2028, 1, 29), 1))).toBe('2028-03-01');
  });
  it('leap year rules', () => {
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2100, 1)).toBe(28); // century rule
    expect(daysInMonth(2000, 1)).toBe(29); // 400-year rule
    expect(parseDateKey('2028-02-29')).not.toBeNull();
    expect(parseDateKey('2026-02-29')).toBeNull();
    expect(parseDateKey('2100-02-29')).toBeNull();
    expect(parseDateKey('2000-02-29')).not.toBeNull();
    expect(parseDateKey('2026-04-31')).toBeNull();
    expect(parseDateKey('2026-00-10')).toBeNull();
    expect(parseDateKey('2026-1-5')).toBeNull();
    expect(parseDateKey(' 2026-09-15 ')?.getDate()).toBe(15);
  });
  it('relative labels across the year boundary', () => {
    const nye = new Date(2026, 11, 31, 22, 0);
    expect(relativeDayLabel(new Date(2027, 0, 1), nye)).toBe('Tomorrow');
    expect(relativeDayLabel(new Date(2026, 11, 30), nye)).toBe('Yesterday');
    expect(relativeDayLabel(new Date(2027, 0, 3), nye)).toBe('Sunday');
    expect(relativeDayLabel(new Date(2027, 0, 8), nye)).toBe('Fri, 8 Jan');
  });
  it('yearly reminder from 31 Dec rolls into the next year', () => {
    const r = reminder({ date: '2026-12-31', time: '10:00', repeat: 'YEARLY' });
    expect(nextOccurrence(r, new Date(2026, 11, 31, 11, 0))?.getFullYear()).toBe(2027);
    expect(occurrenceOnDay(r, new Date(2027, 11, 31))).not.toBeNull();
  });
  it('helpers', () => {
    expect(msUntilNextBoundary(60_000, 60_000)).toBe(60_000);
    expect(msUntilNextBoundary(60_001, 60_000)).toBe(59_999);
    expect(msUntilNextBoundary(119_999, 60_000)).toBe(1);
    expect(formatHHMM(-1)).toBe('23:59');
    expect(parseHHMM(' 07:05 ')).toBe(425);
    expect(parseHHMM('7:05')).toBeNull();
    expect(parseHHMM('07:60')).toBeNull();
    expect(combineDateTime('2026-09-15', '23:59')?.getMinutes()).toBe(59);
    expect(combineDateTime('2026-09-31', '23:59')).toBeNull();
    expect(isSameDay(startOfDay(new Date(2026, 8, 15, 23, 59)), new Date(2026, 8, 15))).toBe(true);
  });
});
