import type { Reminder, ActiveReminder } from '@/types';
import { findDueReminders, REMINDER_GRACE_MS, REMINDER_AUTO_DISMISS_MS, type DueReminder } from './reminderLogic';

export interface TickResult {
  /** Occurrences that must be recorded (lastTriggeredAt = occurrenceAt) and shown. */
  fire: DueReminder[];
  /** The overlay queue after this tick (expired entries removed, new ones appended). */
  active: ActiveReminder[];
  /** True when `active` differs from the input (so callers can skip a no-op store update). */
  changed: boolean;
}

/**
 * One minute-tick of the reminder engine, as a pure function.
 * - A due occurrence is fired at most once: the caller persists lastTriggeredAt = occurrenceAt right away.
 * - Overlays older than autoDismissMs are dropped so the frame can never get stuck on a reminder.
 * - Re-entrancy safe: an occurrence already in the queue is not queued twice.
 */
export function runReminderTick(
  reminders: Reminder[],
  active: ActiveReminder[],
  now: Date,
  graceMs: number = REMINDER_GRACE_MS,
  autoDismissMs: number = REMINDER_AUTO_DISMISS_MS,
): TickResult {
  const nowMs = now.getTime();
  const fire = findDueReminders(reminders, now, graceMs);
  const kept = active.filter((a) => nowMs - a.shownAt < autoDismissMs);
  const next = kept.slice();
  for (const d of fire) {
    if (!next.some((a) => a.reminder.id === d.reminder.id && a.occurrenceAt === d.occurrenceAt)) {
      next.push({ reminder: d.reminder, occurrenceAt: d.occurrenceAt, shownAt: nowMs });
    }
  }
  const changed = next.length !== active.length || next.some((a, i) => a !== active[i]);
  return { fire, active: next, changed };
}

/** Applies a fired occurrence to a reminder list (what markReminderTriggered does in the store). */
export function applyTriggered(reminders: Reminder[], fired: DueReminder[]): Reminder[] {
  if (fired.length === 0) return reminders;
  return reminders.map((r) => {
    const f = fired.find((d) => d.reminder.id === r.id);
    return f ? { ...r, lastTriggeredAt: f.occurrenceAt } : r;
  });
}
