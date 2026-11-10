import type { Reminder, RepeatRule } from '@/types';
import { REPEAT_RULES } from '@/types';
import { parseDateKey, parseHHMM, startOfDay, isSameDay, daysInMonth, addDays } from '@/utils/time';

/** Pure reminder recurrence logic. */

/** Default window after the scheduled time during which a missed reminder is still shown (e.g. after sleep/wake). */
export const REMINDER_GRACE_MS = 10 * 60 * 1000;
/** Overlay auto-dismisses after this long so the frame never gets stuck on a reminder. */
export const REMINDER_AUTO_DISMISS_MS = 15 * 60 * 1000;

/** Returns the reminder's occurrence on the given calendar day, or null if it does not occur that day. */
export function occurrenceOnDay(r: Pick<Reminder, 'date' | 'time' | 'repeat'>, day: Date): Date | null {
  const first = parseDateKey(r.date);
  const mins = parseHHMM(r.time);
  if (!first || mins === null) return null;
  const d0 = startOfDay(day);
  if (d0.getTime() < first.getTime()) return null;

  let matches = false;
  switch (r.repeat) {
    case 'NONE':
      matches = isSameDay(d0, first);
      break;
    case 'DAILY':
      matches = true;
      break;
    case 'WEEKLY':
      matches = d0.getDay() === first.getDay();
      break;
    case 'MONTHLY': {
      // Reminders set on the 29th-31st fire on the last day of shorter months.
      const target = Math.min(first.getDate(), daysInMonth(d0.getFullYear(), d0.getMonth()));
      matches = d0.getDate() === target;
      break;
    }
    case 'YEARLY': {
      if (d0.getMonth() !== first.getMonth()) {
        matches = false;
      } else {
        const target = Math.min(first.getDate(), daysInMonth(d0.getFullYear(), d0.getMonth()));
        matches = d0.getDate() === target;
      }
      break;
    }
    default:
      matches = false;
  }
  if (!matches) return null;
  const occ = new Date(d0);
  occ.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return occ;
}

/** First occurrence at or after `from`. Searches up to `maxDays` days ahead. */
export function nextOccurrence(r: Pick<Reminder, 'date' | 'time' | 'repeat'>, from: Date, maxDays = 400): Date | null {
  const first = parseDateKey(r.date);
  if (!first) return null;
  let day = startOfDay(from.getTime() < first.getTime() ? first : from);
  for (let i = 0; i < maxDays; i++) {
    const occ = occurrenceOnDay(r, day);
    if (occ && occ.getTime() >= from.getTime()) return occ;
    day = addDays(day, 1);
  }
  return null;
}

export interface DueReminder {
  reminder: Reminder;
  occurrenceAt: number;
}

/**
 * Finds reminders whose most recent occurrence is within [now - graceMs, now] and has not been
 * triggered yet. `lastTriggeredAt` stores the occurrence timestamp so an occurrence fires exactly once.
 */
export function findDueReminders(reminders: Reminder[], now: Date, graceMs: number = REMINDER_GRACE_MS): DueReminder[] {
  const due: DueReminder[] = [];
  const nowMs = now.getTime();
  for (const r of reminders) {
    if (!r.enabled) continue;
    // Check today and yesterday so a grace window that spans midnight still works.
    const candidates = [occurrenceOnDay(r, now), occurrenceOnDay(r, addDays(now, -1))];
    for (const occ of candidates) {
      if (!occ) continue;
      const t = occ.getTime();
      if (t > nowMs) continue;
      if (nowMs - t > graceMs) continue;
      // Identity, not a high-water mark: lastTriggeredAt records exactly which occurrence was shown.
      // `>=` would also suppress this (real, un-shown) occurrence if the clock was ever set ahead and
      // then corrected back - a reminder that fired once during the excursion would otherwise never
      // fire again until the clock excursion's own timestamp is reached, potentially days later.
      if (r.lastTriggeredAt !== null && r.lastTriggeredAt === t) continue;
      due.push({ reminder: r, occurrenceAt: t });
      break;
    }
  }
  return due;
}

export interface ReminderInput {
  title: string;
  message: string;
  date: string;
  time: string;
  repeat: RepeatRule;
}

export function validateReminder(input: ReminderInput): string[] {
  const errors: string[] = [];
  if (!input.title || !input.title.trim()) errors.push('Give the reminder a title.');
  if (!parseDateKey(input.date)) errors.push('Pick a valid date.');
  if (parseHHMM(input.time) === null) errors.push('Time must be HH:MM.');
  if (!REPEAT_RULES.includes(input.repeat)) errors.push('Choose a valid repeat option.');
  return errors;
}

export function describeRepeat(rule: RepeatRule): string {
  switch (rule) {
    case 'NONE':
      return 'Once';
    case 'DAILY':
      return 'Every day';
    case 'WEEKLY':
      return 'Every week';
    case 'MONTHLY':
      return 'Every month';
    case 'YEARLY':
      return 'Every year';
    default:
      return rule;
  }
}
