import { describe, it, expect } from 'vitest';
import type { Schedule, FrameModeKind } from '@/types';
import { resolveFrameMode, resolveActiveSchedule, isScheduleActiveAt, computeDayTimeline, nextScheduleBoundary } from '@/scheduler/scheduler';
import { schedule, at } from './helpers';

const ALL = [0, 1, 2, 3, 4, 5, 6];
/** The example schedule set shipped as demo data. */
function exampleSchedules(): Schedule[] {
  return [
    schedule({ id: 'clock-am', name: 'Morning clock', startTime: '06:30', endTime: '07:00', daysOfWeek: ALL, mode: 'CLOCK', priority: 1 }),
    schedule({ id: 'cal-am', name: 'Morning calendar', startTime: '07:00', endTime: '08:00', daysOfWeek: ALL, mode: 'CALENDAR', priority: 1 }),
    schedule({ id: 'photos-day', name: 'Daytime photos', startTime: '08:00', endTime: '18:00', daysOfWeek: ALL, mode: 'PHOTOS', priority: 1 }),
    schedule({ id: 'notes-pm', name: 'Evening notes', startTime: '18:00', endTime: '18:15', daysOfWeek: ALL, mode: 'NOTES', priority: 1 }),
    schedule({ id: 'photos-pm', name: 'Evening photos', startTime: '18:15', endTime: '22:00', daysOfWeek: ALL, mode: 'PHOTOS', priority: 1 }),
    schedule({ id: 'clock-pm', name: 'Night clock', startTime: '22:00', endTime: '23:00', daysOfWeek: ALL, mode: 'CLOCK', priority: 1 }),
    schedule({ id: 'night', name: 'Night mode', startTime: '23:00', endTime: '06:30', daysOfWeek: ALL, mode: 'NIGHT', priority: 1 }),
  ];
}
const modeAt = (list: Schedule[], day: string, hhmm: string, def: FrameModeKind = 'DASHBOARD') => resolveFrameMode({ schedules: list, now: at(day, hhmm), defaultMode: def }).baseMode;

// 2026-09-13 Sun, 14 Mon, 15 Tue, 16 Wed ... 19 Sat, 20 Sun, 21 Mon
const SUN = '2026-09-13', MON = '2026-09-14', TUE = '2026-09-15', WED = '2026-09-16', SAT = '2026-09-19';

describe('minute boundaries switch exactly on time (end exclusive, start inclusive)', () => {
  const list = exampleSchedules();
  const cases: [string, FrameModeKind, string, FrameModeKind][] = [
    ['06:29', 'NIGHT', '06:30', 'CLOCK'],
    ['06:59', 'CLOCK', '07:00', 'CALENDAR'],
    ['07:59', 'CALENDAR', '08:00', 'PHOTOS'],
    ['17:59', 'PHOTOS', '18:00', 'NOTES'],
    ['18:14', 'NOTES', '18:15', 'PHOTOS'],
    ['21:59', 'PHOTOS', '22:00', 'CLOCK'],
    ['22:59', 'CLOCK', '23:00', 'NIGHT'],
  ];
  for (const [before, mBefore, atT, mAt] of cases) {
    it(`${before} -> ${atT}: ${mBefore} -> ${mAt}`, () => {
      expect(modeAt(list, TUE, before)).toBe(mBefore);
      expect(modeAt(list, TUE, atT)).toBe(mAt);
    });
  }
  it('23:59 -> 00:00 stays NIGHT across midnight', () => {
    expect(modeAt(list, TUE, '23:59')).toBe('NIGHT');
    expect(modeAt(list, WED, '00:00')).toBe('NIGHT');
    expect(modeAt(list, WED, '00:01')).toBe('NIGHT');
  });
  it('seconds inside a minute never matter', () => {
    const d = at(TUE, '07:59');
    d.setSeconds(59, 999);
    expect(resolveFrameMode({ schedules: list, now: d, defaultMode: 'DASHBOARD' }).baseMode).toBe('CALENDAR');
    const e = at(TUE, '08:00');
    e.setSeconds(0, 1);
    expect(resolveFrameMode({ schedules: list, now: e, defaultMode: 'DASHBOARD' }).baseMode).toBe('PHOTOS');
  });
  it('covers every minute of every weekday with no default gaps', () => {
    for (let day = 13; day <= 19; day++) {
      const segs = computeDayTimeline(list, new Date(2026, 8, day), 'DASHBOARD');
      expect(segs.every((s) => s.schedule !== null)).toBe(true);
      expect(segs[0]!.startMin).toBe(0);
      expect(segs[segs.length - 1]!.endMin).toBe(1440);
      expect(segs.map((s) => s.mode)).toEqual(['NIGHT', 'CLOCK', 'CALENDAR', 'PHOTOS', 'NOTES', 'PHOTOS', 'CLOCK', 'NIGHT']);
    }
  });
});

describe('days of week around midnight', () => {
  it('Sunday-only overnight schedule covers Sunday night and Monday morning only', () => {
    const s = schedule({ startTime: '23:00', endTime: '06:30', daysOfWeek: [0], mode: 'NIGHT' });
    expect(isScheduleActiveAt(s, at(SUN, '23:30'))).toBe(true);
    expect(isScheduleActiveAt(s, at(MON, '00:00'))).toBe(true);
    expect(isScheduleActiveAt(s, at(MON, '03:00'))).toBe(true);
    expect(isScheduleActiveAt(s, at(MON, '06:29'))).toBe(true);
    expect(isScheduleActiveAt(s, at(MON, '06:30'))).toBe(false);
    expect(isScheduleActiveAt(s, at(MON, '23:30'))).toBe(false); // Monday night not selected
    expect(isScheduleActiveAt(s, at(SUN, '03:00'))).toBe(false); // Saturday night not selected
  });
  it('Monday-only overnight schedule covers Monday night into Tuesday', () => {
    const s = schedule({ startTime: '23:00', endTime: '06:30', daysOfWeek: [1], mode: 'NIGHT' });
    expect(isScheduleActiveAt(s, at(MON, '23:00'))).toBe(true);
    expect(isScheduleActiveAt(s, at(TUE, '05:00'))).toBe(true);
    expect(isScheduleActiveAt(s, at(TUE, '06:30'))).toBe(false);
    expect(isScheduleActiveAt(s, at(TUE, '23:00'))).toBe(false);
    expect(isScheduleActiveAt(s, at(MON, '05:00'))).toBe(false);
  });
  it('weekday-only overnight schedule runs Friday night into Saturday but not Sunday night', () => {
    const s = schedule({ startTime: '22:00', endTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5], mode: 'NIGHT' });
    expect(isScheduleActiveAt(s, at('2026-09-18', '23:00'))).toBe(true); // Fri
    expect(isScheduleActiveAt(s, at(SAT, '03:00'))).toBe(true); // Sat morning (started Fri)
    expect(isScheduleActiveAt(s, at(SAT, '23:00'))).toBe(false); // Sat night
    expect(isScheduleActiveAt(s, at(SUN, '03:00'))).toBe(false); // Sun morning (started Sat)
    expect(isScheduleActiveAt(s, at(SUN, '23:00'))).toBe(false); // Sun night
    expect(isScheduleActiveAt(s, at(MON, '03:00'))).toBe(false); // Mon morning (started Sun)
    expect(isScheduleActiveAt(s, at(MON, '23:00'))).toBe(true); // Mon night
  });
  it('same-day schedule on a single weekday', () => {
    const s = schedule({ startTime: '09:00', endTime: '17:00', daysOfWeek: [2], mode: 'CALENDAR' });
    expect(isScheduleActiveAt(s, at(TUE, '12:00'))).toBe(true);
    expect(isScheduleActiveAt(s, at(WED, '12:00'))).toBe(false);
    expect(isScheduleActiveAt(s, at(MON, '12:00'))).toBe(false);
  });
});

describe('adjacent, overlapping, equal-priority and disabled schedules', () => {
  it('a schedule ending exactly when another starts hands over without gap or overlap', () => {
    const a = schedule({ id: 'a', name: 'A', startTime: '08:00', endTime: '12:00', mode: 'CLOCK', priority: 3 });
    const b = schedule({ id: 'b', name: 'B', startTime: '12:00', endTime: '18:00', mode: 'NOTES', priority: 1 });
    expect(resolveActiveSchedule([a, b], at(TUE, '11:59'))?.id).toBe('a');
    expect(resolveActiveSchedule([a, b], at(TUE, '12:00'))?.id).toBe('b');
    expect(resolveActiveSchedule([b, a], at(TUE, '12:00'))?.id).toBe('b');
  });
  it('overnight schedule handing over to a morning schedule at 06:30 exactly', () => {
    const night = schedule({ id: 'n', startTime: '23:00', endTime: '06:30', mode: 'NIGHT', priority: 5 });
    const morning = schedule({ id: 'm', startTime: '06:30', endTime: '08:00', mode: 'CLOCK', priority: 1 });
    expect(resolveActiveSchedule([night, morning], at(WED, '06:29'))?.id).toBe('n');
    expect(resolveActiveSchedule([night, morning], at(WED, '06:30'))?.id).toBe('m');
  });
  it('equal priority, equal duration, equal name: id decides, independent of input order', () => {
    const a = schedule({ id: 'aaa', name: 'Same', startTime: '10:00', endTime: '12:00', mode: 'CLOCK', priority: 2 });
    const b = schedule({ id: 'bbb', name: 'Same', startTime: '10:00', endTime: '12:00', mode: 'NOTES', priority: 2 });
    const c = schedule({ id: 'ccc', name: 'Same', startTime: '10:00', endTime: '12:00', mode: 'NIGHT', priority: 2 });
    const perms = [[a, b, c], [c, b, a], [b, a, c], [c, a, b]];
    for (const p of perms) expect(resolveActiveSchedule(p, at(TUE, '11:00'))?.id).toBe('aaa');
  });
  it('equal priority: the shorter (more specific) window wins even if it is listed last', () => {
    const wide = schedule({ id: 'wide', startTime: '00:00', endTime: '00:00', mode: 'PHOTOS', priority: 4 });
    const narrow = schedule({ id: 'narrow', startTime: '13:00', endTime: '13:30', mode: 'NOTES', priority: 4 });
    expect(resolveActiveSchedule([wide, narrow], at(TUE, '13:10'))?.id).toBe('narrow');
    expect(resolveActiveSchedule([wide, narrow], at(TUE, '13:30'))?.id).toBe('wide');
  });
  it('higher priority wins regardless of duration; disabled never wins; nothing enabled -> default', () => {
    const wide = schedule({ id: 'wide', startTime: '00:00', endTime: '00:00', mode: 'PHOTOS', priority: 9 });
    const narrow = schedule({ id: 'narrow', startTime: '13:00', endTime: '13:30', mode: 'NOTES', priority: 1 });
    expect(resolveActiveSchedule([wide, narrow], at(TUE, '13:10'))?.id).toBe('wide');
    const off = { ...wide, enabled: false };
    expect(resolveActiveSchedule([off, narrow], at(TUE, '13:10'))?.id).toBe('narrow');
    expect(resolveFrameMode({ schedules: [off, { ...narrow, enabled: false }], now: at(TUE, '13:10'), defaultMode: 'CLOCK' }).baseMode).toBe('CLOCK');
    expect(resolveFrameMode({ schedules: [], now: at(TUE, '13:10'), defaultMode: 'CLOCK' }).baseSource).toBe('default');
  });
  it('a full week of 23:00 -> 06:30 every day never leaves a gap around midnight', () => {
    const night = schedule({ startTime: '23:00', endTime: '06:30', daysOfWeek: ALL, mode: 'NIGHT' });
    for (let day = 13; day <= 20; day++) {
      const key = `2026-09-${String(day).padStart(2, '0')}`;
      for (const hhmm of ['23:00', '23:59', '00:00', '00:01', '03:33', '06:29']) expect(isScheduleActiveAt(night, at(key, hhmm))).toBe(true);
      for (const hhmm of ['06:30', '12:00', '22:59']) expect(isScheduleActiveAt(night, at(key, hhmm))).toBe(false);
    }
  });
});

describe('nextScheduleBoundary walks the day in the right order', () => {
  it('produces the exact sequence of changes for the example schedules', () => {
    const list = exampleSchedules();
    let now = at(TUE, '00:00');
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const b = nextScheduleBoundary(list, now);
      if (!b) break;
      seen.push(`${b.getDate()}@${String(b.getHours()).padStart(2, '0')}:${String(b.getMinutes()).padStart(2, '0')}`);
      now = b;
    }
    expect(seen).toEqual(['15@06:30', '15@07:00', '15@08:00', '15@18:00', '15@18:15', '15@22:00', '15@23:00', '16@06:30']);
  });
  it('returns a strictly future instant and respects days of week', () => {
    const s = schedule({ startTime: '09:00', endTime: '10:00', daysOfWeek: [1], mode: 'CLOCK' }); // Mondays only
    const b = nextScheduleBoundary([s], at(TUE, '09:30'));
    expect(b?.getDay()).toBe(1);
    expect(b!.getTime()).toBeGreaterThan(at(TUE, '09:30').getTime());
    expect(`${b!.getHours()}:${b!.getMinutes()}`).toBe('9:0');
  });
});
