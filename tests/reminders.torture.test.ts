import { describe, it, expect } from 'vitest';
import type { Reminder, ActiveReminder } from '@/types';
import { runReminderTick, applyTriggered } from '@/reminders/reminderEngine';
import { findDueReminders, occurrenceOnDay, nextOccurrence, REMINDER_GRACE_MS, REMINDER_AUTO_DISMISS_MS } from '@/reminders/reminderLogic';
import { reminder, at } from './helpers';

/** Simulates the app: one tick per minute; fired occurrences are persisted immediately (store-first). */
function simulate(reminders: Reminder[], from: Date, to: Date, stepMs = 60_000, dismissEveryTick = true) {
  let list = reminders;
  let active: ActiveReminder[] = [];
  const fires = new Map<string, number[]>();
  for (let t = from.getTime(); t < to.getTime(); t += stepMs) {
    const now = new Date(t);
    const r = runReminderTick(list, active, now);
    for (const d of r.fire) fires.set(d.reminder.id, [...(fires.get(d.reminder.id) ?? []), d.occurrenceAt]);
    list = applyTriggered(list, r.fire);
    active = dismissEveryTick ? [] : r.active;
  }
  return { fires, list, active };
}

describe('reminder engine over a simulated month (accelerated, 1-minute ticks)', () => {
  it('fires each repeat rule the right number of times and never twice for one occurrence', () => {
    const daily = reminder({ id: 'daily', date: '2026-01-15', time: '07:00', repeat: 'DAILY' });
    const weekly = reminder({ id: 'weekly', date: '2026-01-15', time: '07:00', repeat: 'WEEKLY' }); // Thursday
    const monthly = reminder({ id: 'monthly', date: '2026-01-15', time: '07:00', repeat: 'MONTHLY' });
    const yearly = reminder({ id: 'yearly', date: '2026-01-15', time: '07:00', repeat: 'YEARLY' });
    const once = reminder({ id: 'once', date: '2026-01-15', time: '07:00', repeat: 'NONE' });
    const { fires } = simulate([daily, weekly, monthly, yearly, once], at('2026-01-15', '00:00'), at('2026-02-14', '00:00'));
    expect(fires.get('daily')?.length).toBe(30);
    expect(fires.get('weekly')?.length).toBe(5); // Jan 15, 22, 29, Feb 5, 12
    expect(fires.get('monthly')?.length).toBe(1);
    expect(fires.get('yearly')?.length).toBe(1);
    expect(fires.get('once')?.length).toBe(1);
    // every fired occurrence is unique
    for (const [, occs] of fires) expect(new Set(occs).size).toBe(occs.length);
    // and each daily fire is exactly at 07:00 local
    for (const o of fires.get('daily')!) expect(new Date(o).getHours() * 60 + new Date(o).getMinutes()).toBe(7 * 60);
  });

  it('31 January monthly: fires on the last day of shorter months, then 31 March (2026 is not a leap year)', () => {
    const r = reminder({ id: 'm31', date: '2026-01-31', time: '09:00', repeat: 'MONTHLY' });
    const { fires } = simulate([r], at('2026-01-01', '00:00'), at('2026-05-01', '00:00'));
    expect(fires.get('m31')!.map((o) => `${new Date(o).getMonth() + 1}/${new Date(o).getDate()}`)).toEqual(['1/31', '2/28', '3/31', '4/30']);
  });

  it('29 February yearly: 28 Feb in common years, 29 Feb in leap years, never 1 March', () => {
    const r = reminder({ id: 'leap', date: '2028-02-29', time: '08:00', repeat: 'YEARLY' });
    expect(occurrenceOnDay(r, at('2029-02-28', '00:00'))).not.toBeNull();
    expect(occurrenceOnDay(r, at('2029-03-01', '00:00'))).toBeNull();
    expect(occurrenceOnDay(r, at('2032-02-29', '00:00'))).not.toBeNull();
    expect(occurrenceOnDay(r, at('2032-02-28', '00:00'))).toBeNull();
    expect(nextOccurrence(r, at('2028-03-01', '00:00'))?.toDateString()).toBe(at('2029-02-28', '00:00').toDateString());
  });
});

describe('boundary moments', () => {
  it('current minute: a reminder created for the minute we are in fires on the very next tick', () => {
    const now = new Date(2026, 8, 15, 14, 36, 25);
    const r = reminder({ date: '2026-09-15', time: '14:36', repeat: 'NONE' });
    expect(findDueReminders([r], now)).toHaveLength(1);
  });
  it('next minute: not due now, due at the boundary', () => {
    const r = reminder({ date: '2026-09-15', time: '14:37', repeat: 'NONE' });
    expect(findDueReminders([r], new Date(2026, 8, 15, 14, 36, 59))).toHaveLength(0);
    expect(findDueReminders([r], new Date(2026, 8, 15, 14, 37, 0))).toHaveLength(1);
  });
  it('midnight daily reminder fires once at 00:00 and not at 23:59 the day before', () => {
    const r = reminder({ id: 'mid', date: '2026-09-15', time: '00:00', repeat: 'DAILY' });
    const { fires } = simulate([r], at('2026-09-15', '23:00'), at('2026-09-16', '01:00'));
    expect(fires.get('mid')!.map((o) => new Date(o).toString().slice(0, 24))).toEqual([at('2026-09-16', '00:00').toString().slice(0, 24)]);
  });
  it('year end: a 23:59 daily reminder on 31 Dec fires once, and again on 1 Jan', () => {
    const r = reminder({ id: 'ye', date: '2026-12-31', time: '23:59', repeat: 'DAILY' });
    const { fires } = simulate([r], at('2026-12-31', '23:00'), at('2027-01-02', '00:30'));
    expect(fires.get('ye')!.map((o) => new Date(o).getDate())).toEqual([31, 1]);
  });
  it('month end: a monthly reminder on the 30th skips to 28 Feb and back to 30 March', () => {
    const r = reminder({ id: 'm30', date: '2026-01-30', time: '10:00', repeat: 'MONTHLY' });
    const { fires } = simulate([r], at('2026-01-01', '00:00'), at('2026-04-01', '00:00'));
    expect(fires.get('m30')!.map((o) => new Date(o).getDate())).toEqual([30, 28, 30]);
  });
});

describe('refresh, dismiss, disable, delete, duplicates', () => {
  const base = reminder({ id: 'r', date: '2026-09-15', time: '19:00', repeat: 'DAILY' });

  it('refresh just BEFORE the time: nothing persisted yet, so it fires at 19:00 after the reload', () => {
    // Before: lastTriggeredAt null persisted. After reload the engine starts with an empty queue.
    expect(findDueReminders([base], at('2026-09-15', '18:59'))).toHaveLength(0);
    const afterReload = runReminderTick([base], [], at('2026-09-15', '19:00'));
    expect(afterReload.fire).toHaveLength(1);
  });
  it('refresh just AFTER it fired: lastTriggeredAt was persisted store-first, so it does not fire again', () => {
    const first = runReminderTick([base], [], at('2026-09-15', '19:00'));
    const persisted = applyTriggered([base], first.fire);
    // simulate reload: fresh engine state, same persisted reminders, still inside the grace window
    const afterReload = runReminderTick(persisted, [], at('2026-09-15', '19:04'));
    expect(afterReload.fire).toHaveLength(0);
    expect(afterReload.active).toHaveLength(0);
    // tomorrow it fires again
    expect(runReminderTick(persisted, [], at('2026-09-16', '19:00')).fire).toHaveLength(1);
  });
  it('dismissed: removing it from the queue does not make it fire again on later ticks', () => {
    const t0 = runReminderTick([base], [], at('2026-09-15', '19:00'));
    const list = applyTriggered([base], t0.fire);
    const dismissed: ActiveReminder[] = []; // user pressed DISMISS
    const t1 = runReminderTick(list, dismissed, at('2026-09-15', '19:01'));
    expect(t1.fire).toHaveLength(0);
    expect(t1.active).toHaveLength(0);
    expect(t1.changed).toBe(false);
  });
  it('not dismissed: the same occurrence stays queued exactly once across ticks and auto-dismisses later', () => {
    const t0 = runReminderTick([base], [], at('2026-09-15', '19:00'));
    const list = applyTriggered([base], t0.fire);
    const t1 = runReminderTick(list, t0.active, at('2026-09-15', '19:05'));
    expect(t1.active).toHaveLength(1);
    expect(t1.changed).toBe(false);
    const t2 = runReminderTick(list, t1.active, new Date(at('2026-09-15', '19:00').getTime() + REMINDER_AUTO_DISMISS_MS));
    expect(t2.active).toHaveLength(0);
    expect(t2.changed).toBe(true);
  });
  it('disabled: never fires; re-enabled inside the grace window fires, outside it waits for the next occurrence', () => {
    const off = { ...base, enabled: false };
    expect(runReminderTick([off], [], at('2026-09-15', '19:00')).fire).toHaveLength(0);
    const onAgainSoon = { ...base, enabled: true };
    expect(runReminderTick([onAgainSoon], [], new Date(at('2026-09-15', '19:00').getTime() + REMINDER_GRACE_MS)).fire).toHaveLength(1);
    expect(runReminderTick([onAgainSoon], [], at('2026-09-15', '19:30')).fire).toHaveLength(0);
    expect(runReminderTick([onAgainSoon], [], at('2026-09-16', '19:00')).fire).toHaveLength(1);
  });
  it('deleted: a queued overlay is dropped by the caller and a missing reminder never fires', () => {
    const t0 = runReminderTick([base], [], at('2026-09-15', '19:00'));
    // dataService.deleteReminder removes both the reminder and its overlay:
    const active = t0.active.filter((a) => a.reminder.id !== base.id);
    const t1 = runReminderTick([], active, at('2026-09-15', '19:01'));
    expect(t1.fire).toHaveLength(0);
    expect(t1.active).toHaveLength(0);
  });
  it('multiple reminders at the same minute all fire and all queue', () => {
    const list = ['a', 'b', 'c'].map((id) => reminder({ id, title: id, date: '2026-09-15', time: '07:00', repeat: 'DAILY' }));
    const t = runReminderTick(list, [], at('2026-09-15', '07:00'));
    expect(t.fire.map((f) => f.reminder.id).sort()).toEqual(['a', 'b', 'c']);
    expect(t.active).toHaveLength(3);
    const persisted = applyTriggered(list, t.fire);
    expect(runReminderTick(persisted, t.active, at('2026-09-15', '07:01')).fire).toHaveLength(0);
  });
  it('editing the time resets the trigger memory: a reminder moved to a later minute today fires again', () => {
    const t0 = runReminderTick([base], [], at('2026-09-15', '19:00'));
    const persisted = applyTriggered([base], t0.fire)[0]!;
    const moved = { ...persisted, time: '19:30', lastTriggeredAt: null }; // saveReminder clears it when time changes
    expect(runReminderTick([moved], [], at('2026-09-15', '19:30')).fire).toHaveLength(1);
  });
});

describe('clock set ahead then corrected back', () => {
  it('a lastTriggeredAt from a future clock excursion does not suppress the real occurrence once the clock is corrected', () => {
    const r = reminder({ id: 'clockjump', date: '2026-09-15', time: '08:30', repeat: 'DAILY' });
    // The Mac clock was briefly five days ahead; the reminder fired then and the occurrence was persisted.
    const futureOccurrence = at('2026-09-20', '08:30').getTime();
    const withFutureTrigger = { ...r, lastTriggeredAt: futureOccurrence };
    // Clock corrected back: every day up to and including 2026-09-20 must still fire (only the exact
    // recorded occurrence is skipped), not "everything up to the future timestamp".
    expect(findDueReminders([withFutureTrigger], at('2026-09-16', '08:30'))).toHaveLength(1);
    expect(findDueReminders([withFutureTrigger], at('2026-09-19', '08:30'))).toHaveLength(1);
    expect(findDueReminders([withFutureTrigger], at('2026-09-20', '08:30'))).toHaveLength(0); // the one that already fired
    expect(findDueReminders([withFutureTrigger], at('2026-09-21', '08:30'))).toHaveLength(1);
  });
});
