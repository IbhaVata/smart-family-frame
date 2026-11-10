/**
 * Daylight-saving behaviour. The frame always uses the machine's local zone; these tests temporarily switch
 * this test process to America/New_York, where 2026-03-08 02:00-03:00 does not exist and 2026-11-01
 * 01:00-02:00 happens twice. India (the current deployment) has no DST, but the logic must be safe anywhere.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nextScheduleBoundary, isScheduleActiveAt, computeDayTimeline } from '@/scheduler/scheduler';
import { runReminderTick, applyTriggered } from '@/reminders/reminderEngine';
import { occurrenceOnDay } from '@/reminders/reminderLogic';
import { addDays, toDateKey } from '@/utils/time';
import { schedule, reminder } from './helpers';
import type { Reminder, ActiveReminder } from '@/types';

// The app is typed against the DOM only; this test file is the one place that touches the Node process object.
declare const process: { env: Record<string, string | undefined> };

// Evaluated at module load (before test collection) so skipIf sees the right value. `npm run test:dst`
// starts the process with TZ=America/New_York; setting it here as well covers plain `vitest run`.
const originalTZ = process.env.TZ;
process.env.TZ = 'America/New_York';
// Sanity: 02:30 on 2026-03-08 does not exist in New York; JS normalises it to 03:30.
const dstAvailable = new Date(2026, 2, 8, 2, 30).getHours() === 3 && new Date(2026, 2, 8, 12).getTimezoneOffset() === 240;
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

function simulateEpoch(reminders: Reminder[], fromMs: number, toMs: number) {
  let list = reminders;
  let active: ActiveReminder[] = [];
  const fires: number[] = [];
  for (let t = fromMs; t < toMs; t += 60_000) {
    const r = runReminderTick(list, active, new Date(t));
    fires.push(...r.fire.map((f) => f.occurrenceAt));
    list = applyTriggered(list, r.fire);
    active = r.active;
  }
  return fires;
}

describe('daylight-saving transition days (America/New_York)', () => {
  it.skipIf(!dstAvailable)('spring forward: next schedule boundary is at the real local 03:00, not an hour later', () => {
    const s = schedule({ startTime: '03:00', endTime: '05:00', mode: 'CLOCK' });
    const b = nextScheduleBoundary([s], new Date(2026, 2, 8, 0, 30));
    expect(b).not.toBeNull();
    expect(b!.getHours()).toBe(3);
    expect(b!.getMinutes()).toBe(0);
    expect(b!.getDate()).toBe(8);
    // 03:00 EDT is 07:00 UTC (the day is only 23 hours long).
    expect(b!.getTime()).toBe(Date.UTC(2026, 2, 8, 7, 0));
  });
  it.skipIf(!dstAvailable)('spring forward: a schedule spanning the missing hour is simply active before and after it', () => {
    const s = schedule({ startTime: '01:00', endTime: '04:00', mode: 'NIGHT' });
    expect(isScheduleActiveAt(s, new Date(Date.UTC(2026, 2, 8, 6, 30)))).toBe(true); // 01:30 EST
    expect(isScheduleActiveAt(s, new Date(Date.UTC(2026, 2, 8, 7, 30)))).toBe(true); // 03:30 EDT
    expect(isScheduleActiveAt(s, new Date(Date.UTC(2026, 2, 8, 8, 0)))).toBe(false); // 04:00 EDT
    const segs = computeDayTimeline([s], new Date(2026, 2, 8), 'PHOTOS');
    expect(segs.map((x) => [x.startMin, x.endMin, x.mode])).toEqual([[0, 60, 'PHOTOS'], [60, 240, 'NIGHT'], [240, 1440, 'PHOTOS']]);
  });
  it.skipIf(!dstAvailable)('spring forward: a 02:30 daily reminder fires exactly once that day (at 03:30, the normalised time)', () => {
    const r = reminder({ date: '2026-03-01', time: '02:30', repeat: 'DAILY' });
    const fires = simulateEpoch([r], Date.UTC(2026, 2, 8, 5, 0), Date.UTC(2026, 2, 9, 5, 0)); // local 00:00 -> 00:00 next day
    expect(fires).toHaveLength(1);
    expect(new Date(fires[0]!).getHours()).toBe(3);
  });
  it.skipIf(!dstAvailable)('fall back: a 01:30 daily reminder fires exactly once although 01:30 happens twice', () => {
    const r = reminder({ date: '2026-10-01', time: '01:30', repeat: 'DAILY' });
    const fires = simulateEpoch([r], Date.UTC(2026, 10, 1, 4, 0), Date.UTC(2026, 10, 1, 9, 0)); // local 00:00 EDT -> 04:00 EST
    expect(fires).toHaveLength(1);
  });
  it.skipIf(!dstAvailable)('fall back: an overnight schedule stays active through the repeated hour and ends at the right local time', () => {
    const s = schedule({ startTime: '23:00', endTime: '06:30', mode: 'NIGHT' });
    expect(isScheduleActiveAt(s, new Date(Date.UTC(2026, 10, 1, 5, 30)))).toBe(true); // 01:30 EDT (first)
    expect(isScheduleActiveAt(s, new Date(Date.UTC(2026, 10, 1, 6, 30)))).toBe(true); // 01:30 EST (second)
    expect(isScheduleActiveAt(s, new Date(Date.UTC(2026, 10, 1, 11, 29)))).toBe(true); // 06:29 EST
    expect(isScheduleActiveAt(s, new Date(Date.UTC(2026, 10, 1, 11, 30)))).toBe(false); // 06:30 EST
  });
  it.skipIf(!dstAvailable)('calendar-day helpers ignore the 23h/25h day length', () => {
    expect(toDateKey(addDays(new Date(2026, 2, 7, 12), 1))).toBe('2026-03-08');
    expect(toDateKey(addDays(new Date(2026, 2, 8, 12), 1))).toBe('2026-03-09');
    expect(toDateKey(addDays(new Date(2026, 10, 1, 0, 30), 1))).toBe('2026-11-02');
    expect(occurrenceOnDay(reminder({ date: '2026-01-01', time: '23:30', repeat: 'DAILY' }), new Date(2026, 10, 1))?.getHours()).toBe(23);
  });
  it('reports whether DST simulation was possible in this test process', () => {
    // Not a failure either way; the summary shows whether the DST cases above ran or were skipped.
    expect(typeof dstAvailable).toBe('boolean');
  });
});
