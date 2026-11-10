import { describe, it, expect } from 'vitest';
import { isScheduleActiveAt, resolveActiveSchedule, resolveFrameMode, validateSchedule, computeDayTimeline, nextScheduleBoundary, scheduleDurationMinutes, crossesMidnight } from '@/scheduler/scheduler';
import { schedule, at } from './helpers';

// 2026-09-15 is a Tuesday (day 2). 2026-09-19 is Saturday, 2026-09-20 is Sunday.
const TUE = '2026-09-15';
const WED = '2026-09-16';
const SAT = '2026-09-19';
const SUN = '2026-09-20';

describe('daytime schedules', () => {
  const clock = schedule({ name: 'Morning clock', startTime: '06:30', endTime: '07:00', mode: 'CLOCK' });
  const photos = schedule({ name: 'Day photos', startTime: '08:00', endTime: '18:00', mode: 'PHOTOS' });

  it('is active inside the window, start inclusive, end exclusive', () => {
    expect(isScheduleActiveAt(clock, at(TUE, '06:29'))).toBe(false);
    expect(isScheduleActiveAt(clock, at(TUE, '06:30'))).toBe(true);
    expect(isScheduleActiveAt(clock, at(TUE, '06:59'))).toBe(true);
    expect(isScheduleActiveAt(clock, at(TUE, '07:00'))).toBe(false);
  });

  it('resolves the right mode over a day', () => {
    const all = [clock, photos];
    expect(resolveActiveSchedule(all, at(TUE, '06:45'))?.mode).toBe('CLOCK');
    expect(resolveActiveSchedule(all, at(TUE, '12:00'))?.mode).toBe('PHOTOS');
    expect(resolveActiveSchedule(all, at(TUE, '19:00'))).toBeNull();
  });

  it('respects days of week', () => {
    const weekdaysOnly = schedule({ startTime: '08:00', endTime: '18:00', mode: 'PHOTOS', daysOfWeek: [1, 2, 3, 4, 5] });
    expect(isScheduleActiveAt(weekdaysOnly, at(TUE, '12:00'))).toBe(true);
    expect(isScheduleActiveAt(weekdaysOnly, at(SAT, '12:00'))).toBe(false);
  });

  it('falls back to the default mode when nothing matches', () => {
    const r = resolveFrameMode({ schedules: [clock], now: at(TUE, '12:00'), defaultMode: 'DASHBOARD' });
    expect(r.baseMode).toBe('DASHBOARD');
    expect(r.baseSource).toBe('default');
    expect(r.schedule).toBeNull();
  });
});

describe('cross-midnight schedules', () => {
  const night = schedule({ name: 'Night', startTime: '23:00', endTime: '06:30', mode: 'NIGHT' });

  it('is active late evening, after midnight, and inactive after the end', () => {
    expect(isScheduleActiveAt(night, at(TUE, '22:59'))).toBe(false);
    expect(isScheduleActiveAt(night, at(TUE, '23:00'))).toBe(true);
    expect(isScheduleActiveAt(night, at(TUE, '23:59'))).toBe(true);
    expect(isScheduleActiveAt(night, at(WED, '00:00'))).toBe(true);
    expect(isScheduleActiveAt(night, at(WED, '03:15'))).toBe(true);
    expect(isScheduleActiveAt(night, at(WED, '06:29'))).toBe(true);
    expect(isScheduleActiveAt(night, at(WED, '06:30'))).toBe(false);
    expect(isScheduleActiveAt(night, at(WED, '12:00'))).toBe(false);
  });

  it('uses the START day for days-of-week, so a Saturday-night schedule covers Sunday morning', () => {
    const satNight = schedule({ startTime: '23:00', endTime: '06:30', mode: 'NIGHT', daysOfWeek: [6] });
    expect(isScheduleActiveAt(satNight, at(SAT, '23:30'))).toBe(true);
    expect(isScheduleActiveAt(satNight, at(SUN, '02:00'))).toBe(true);
    expect(isScheduleActiveAt(satNight, at(SUN, '23:30'))).toBe(false);
    expect(isScheduleActiveAt(satNight, at(SAT, '02:00'))).toBe(false); // Friday night not selected
  });

  it('reports duration and crossing correctly', () => {
    expect(crossesMidnight(night)).toBe(true);
    expect(scheduleDurationMinutes(night)).toBe(7 * 60 + 30);
    expect(scheduleDurationMinutes(schedule({ startTime: '08:00', endTime: '18:00', mode: 'PHOTOS' }))).toBe(600);
    expect(scheduleDurationMinutes(schedule({ startTime: '08:00', endTime: '08:00', mode: 'PHOTOS' }))).toBe(1440);
  });

  it('treats start == end as all day', () => {
    const allDay = schedule({ startTime: '00:00', endTime: '00:00', mode: 'PHOTOS' });
    expect(isScheduleActiveAt(allDay, at(TUE, '00:00'))).toBe(true);
    expect(isScheduleActiveAt(allDay, at(TUE, '13:37'))).toBe(true);
    expect(isScheduleActiveAt(allDay, at(TUE, '23:59'))).toBe(true);
  });
});

describe('overlapping schedules', () => {
  const allDayPhotos = schedule({ id: 'photos', name: 'Photos', startTime: '00:00', endTime: '00:00', mode: 'PHOTOS', priority: 0 });
  const lunchNotes = schedule({ id: 'notes', name: 'Lunch notes', startTime: '12:00', endTime: '13:00', mode: 'NOTES', priority: 5 });
  const lowClock = schedule({ id: 'clock', name: 'Clock', startTime: '11:00', endTime: '14:00', mode: 'CLOCK', priority: 1 });

  it('picks the highest priority schedule', () => {
    const r = resolveFrameMode({ schedules: [allDayPhotos, lowClock, lunchNotes], now: at(TUE, '12:30'), defaultMode: 'DASHBOARD' });
    expect(r.baseMode).toBe('NOTES');
    expect(r.schedule?.id).toBe('notes');
    expect(r.baseSource).toBe('schedule');
  });

  it('falls to the next priority outside the higher one', () => {
    expect(resolveActiveSchedule([allDayPhotos, lowClock, lunchNotes], at(TUE, '11:30'))?.id).toBe('clock');
    expect(resolveActiveSchedule([allDayPhotos, lowClock, lunchNotes], at(TUE, '15:00'))?.id).toBe('photos');
  });

  it('is deterministic on equal priority: shorter window wins, then name', () => {
    const a = schedule({ id: 'a', name: 'Zed', startTime: '10:00', endTime: '12:00', mode: 'CLOCK', priority: 2 });
    const b = schedule({ id: 'b', name: 'Alpha', startTime: '09:00', endTime: '18:00', mode: 'NOTES', priority: 2 });
    expect(resolveActiveSchedule([a, b], at(TUE, '11:00'))?.id).toBe('a');
    expect(resolveActiveSchedule([b, a], at(TUE, '11:00'))?.id).toBe('a');
    const c = schedule({ id: 'c', name: 'Alpha', startTime: '10:00', endTime: '12:00', mode: 'NIGHT', priority: 2 });
    for (let i = 0; i < 5; i++) expect(resolveActiveSchedule([a, c], at(TUE, '11:00'))?.id).toBe('c');
    for (let i = 0; i < 5; i++) expect(resolveActiveSchedule([c, a], at(TUE, '11:00'))?.id).toBe('c');
  });

  it('cross-midnight schedule beats a lower-priority all-day schedule after midnight', () => {
    const night = schedule({ id: 'night', startTime: '23:00', endTime: '06:30', mode: 'NIGHT', priority: 3 });
    expect(resolveActiveSchedule([allDayPhotos, night], at(WED, '01:00'))?.id).toBe('night');
    expect(resolveActiveSchedule([allDayPhotos, night], at(WED, '07:00'))?.id).toBe('photos');
  });
});

describe('disabled schedules', () => {
  it('never activates a disabled schedule', () => {
    const s = schedule({ startTime: '08:00', endTime: '18:00', mode: 'PHOTOS', enabled: false, priority: 99 });
    expect(isScheduleActiveAt(s, at(TUE, '12:00'))).toBe(false);
    const r = resolveFrameMode({ schedules: [s], now: at(TUE, '12:00'), defaultMode: 'CLOCK' });
    expect(r.baseMode).toBe('CLOCK');
    expect(r.baseSource).toBe('default');
  });

  it('ignores schedules with invalid times or no days', () => {
    expect(isScheduleActiveAt(schedule({ startTime: '25:00', endTime: '18:00', mode: 'PHOTOS' }), at(TUE, '12:00'))).toBe(false);
    expect(isScheduleActiveAt(schedule({ startTime: '08:00', endTime: '18:00', mode: 'PHOTOS', daysOfWeek: [] }), at(TUE, '12:00'))).toBe(false);
  });
});

describe('priority order: reminder > override > schedule > default', () => {
  const photos = schedule({ startTime: '00:00', endTime: '00:00', mode: 'PHOTOS' });

  it('shows the reminder overlay regardless of schedule', () => {
    const r = resolveFrameMode({ schedules: [photos], now: at(TUE, '12:00'), defaultMode: 'CLOCK', hasActiveReminder: true });
    expect(r.overlay).toBe('REMINDER');
    expect(r.baseMode).toBe('PHOTOS');
  });

  it('manual override wins over schedules', () => {
    const r = resolveFrameMode({ schedules: [photos], now: at(TUE, '12:00'), defaultMode: 'CLOCK', override: 'NOTES' });
    expect(r.baseMode).toBe('NOTES');
    expect(r.baseSource).toBe('override');
    expect(r.overlay).toBeNull();
  });
});

describe('schedule validation and helpers', () => {
  it('validates input', () => {
    expect(validateSchedule({ name: 'x', startTime: '08:00', endTime: '09:00', daysOfWeek: [1], mode: 'PHOTOS', priority: 1 })).toEqual([]);
    const errors = validateSchedule({ name: '', startTime: '8:00', endTime: '09:60', daysOfWeek: [], mode: 'NOPE' as never, priority: Number.NaN });
    expect(errors.length).toBe(6);
  });

  it('builds a merged daily timeline', () => {
    const clock = schedule({ startTime: '06:30', endTime: '07:00', mode: 'CLOCK' });
    const night = schedule({ startTime: '23:00', endTime: '06:30', mode: 'NIGHT' });
    const segs = computeDayTimeline([clock, night], at(TUE, '00:00'), 'PHOTOS');
    expect(segs.map((s) => [s.startMin, s.endMin, s.mode])).toEqual([
      [0, 390, 'NIGHT'],
      [390, 420, 'CLOCK'],
      [420, 1380, 'PHOTOS'],
      [1380, 1440, 'NIGHT'],
    ]);
  });

  it('finds the next boundary including across midnight', () => {
    const night = schedule({ startTime: '23:00', endTime: '06:30', mode: 'NIGHT' });
    expect(nextScheduleBoundary([night], at(TUE, '22:00'))?.getTime()).toBe(at(TUE, '23:00').getTime());
    expect(nextScheduleBoundary([night], at(TUE, '23:30'))?.getTime()).toBe(at(WED, '06:30').getTime());
    expect(nextScheduleBoundary([], at(TUE, '23:30'))).toBeNull();
  });
});
