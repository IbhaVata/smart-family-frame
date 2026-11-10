import { describe, it, expect } from 'vitest';
import { occurrenceOnDay, nextOccurrence, findDueReminders, validateReminder, REMINDER_GRACE_MS } from '@/reminders/reminderLogic';
import { reminder, at } from './helpers';

const day = (s: string) => at(s, '00:00');

describe('reminder repeat: NONE', () => {
  const r = reminder({ date: '2026-09-15', time: '19:00', repeat: 'NONE' });
  it('occurs only on its date', () => {
    expect(occurrenceOnDay(r, day('2026-09-15'))?.getTime()).toBe(at('2026-09-15', '19:00').getTime());
    expect(occurrenceOnDay(r, day('2026-09-16'))).toBeNull();
    expect(occurrenceOnDay(r, day('2026-09-14'))).toBeNull();
  });
});

describe('reminder repeat: DAILY', () => {
  const r = reminder({ date: '2026-09-15', time: '07:00', repeat: 'DAILY' });
  it('occurs every day from the start date', () => {
    expect(occurrenceOnDay(r, day('2026-09-14'))).toBeNull();
    expect(occurrenceOnDay(r, day('2026-09-15'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2026-12-25'))?.getHours()).toBe(7);
    expect(nextOccurrence(r, at('2026-09-15', '07:01'))?.getTime()).toBe(at('2026-09-16', '07:00').getTime());
    expect(nextOccurrence(r, at('2026-09-15', '06:59'))?.getTime()).toBe(at('2026-09-15', '07:00').getTime());
  });
});

describe('reminder repeat: WEEKLY', () => {
  const r = reminder({ date: '2026-09-15', time: '10:00', repeat: 'WEEKLY' }); // Tuesday
  it('occurs on the same weekday', () => {
    expect(occurrenceOnDay(r, day('2026-09-22'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2026-09-23'))).toBeNull();
    expect(nextOccurrence(r, at('2026-09-16', '00:00'))?.getTime()).toBe(at('2026-09-22', '10:00').getTime());
  });
});

describe('reminder repeat: MONTHLY', () => {
  it('occurs on the same day of month', () => {
    const r = reminder({ date: '2026-09-15', time: '09:00', repeat: 'MONTHLY' });
    expect(occurrenceOnDay(r, day('2026-10-15'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2026-10-14'))).toBeNull();
    expect(nextOccurrence(r, at('2026-09-16', '00:00'))?.getTime()).toBe(at('2026-10-15', '09:00').getTime());
  });
  it('clamps to the last day of shorter months', () => {
    const r = reminder({ date: '2026-01-31', time: '09:00', repeat: 'MONTHLY' });
    expect(occurrenceOnDay(r, day('2026-02-28'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2026-04-30'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2026-03-31'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2026-03-30'))).toBeNull();
  });
});

describe('reminder repeat: YEARLY', () => {
  it('occurs on the same month and day each year', () => {
    const r = reminder({ date: '2026-09-15', time: '08:00', repeat: 'YEARLY' });
    expect(occurrenceOnDay(r, day('2027-09-15'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2027-09-16'))).toBeNull();
    expect(occurrenceOnDay(r, day('2027-10-15'))).toBeNull();
    expect(nextOccurrence(r, at('2026-09-16', '00:00'))?.getTime()).toBe(at('2027-09-15', '08:00').getTime());
  });
  it('handles Feb 29 in non-leap years', () => {
    const r = reminder({ date: '2028-02-29', time: '08:00', repeat: 'YEARLY' });
    expect(occurrenceOnDay(r, day('2029-02-28'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2032-02-29'))).not.toBeNull();
    expect(occurrenceOnDay(r, day('2032-02-28'))).toBeNull();
  });
});

describe('due detection', () => {
  it('fires at the scheduled minute and not before', () => {
    const r = reminder({ date: '2026-09-15', time: '19:00', repeat: 'DAILY' });
    expect(findDueReminders([r], at('2026-09-15', '18:59'))).toHaveLength(0);
    const due = findDueReminders([r], at('2026-09-15', '19:00'));
    expect(due).toHaveLength(1);
    expect(due[0]!.occurrenceAt).toBe(at('2026-09-15', '19:00').getTime());
  });

  it('does not fire the same occurrence twice', () => {
    const r = reminder({ date: '2026-09-15', time: '19:00', repeat: 'DAILY', lastTriggeredAt: at('2026-09-15', '19:00').getTime() });
    expect(findDueReminders([r], at('2026-09-15', '19:00'))).toHaveLength(0);
    expect(findDueReminders([r], at('2026-09-15', '19:03'))).toHaveLength(0);
    // Next day's occurrence fires again.
    expect(findDueReminders([r], at('2026-09-16', '19:00'))).toHaveLength(1);
  });

  it('fires within the grace window (e.g. after the Mac wakes up) but not later', () => {
    const r = reminder({ date: '2026-09-15', time: '19:00', repeat: 'NONE' });
    expect(findDueReminders([r], new Date(at('2026-09-15', '19:00').getTime() + REMINDER_GRACE_MS))).toHaveLength(1);
    expect(findDueReminders([r], new Date(at('2026-09-15', '19:00').getTime() + REMINDER_GRACE_MS + 1))).toHaveLength(0);
  });

  it('handles a grace window that spans midnight', () => {
    const r = reminder({ date: '2026-09-15', time: '23:58', repeat: 'DAILY' });
    expect(findDueReminders([r], at('2026-09-16', '00:02'))).toHaveLength(1);
  });

  it('ignores disabled reminders', () => {
    const r = reminder({ date: '2026-09-15', time: '19:00', repeat: 'DAILY', enabled: false });
    expect(findDueReminders([r], at('2026-09-15', '19:00'))).toHaveLength(0);
  });

  it('validates input', () => {
    expect(validateReminder({ title: 'Call Mom', message: '', date: '2026-09-15', time: '19:00', repeat: 'DAILY' })).toEqual([]);
    expect(validateReminder({ title: '', message: '', date: '2026-02-30', time: '7pm', repeat: 'SOMETIMES' as never })).toHaveLength(4);
  });
});
