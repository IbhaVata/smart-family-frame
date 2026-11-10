import type { Reminder } from '@/types';
import { occurrenceOnDay } from '@/reminders/reminderLogic';

/** Remote text edits and reconnects must not re-fire a reminder that was already shown locally. */
export function parseRemoteReminder(id: string, data: Record<string, unknown>, existing?: Reminder): Reminder | null {
  if (typeof data.title !== 'string' || typeof data.date !== 'string' || typeof data.time !== 'string') return null;
  const repeat = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(data.repeat)) ? data.repeat as Reminder['repeat'] : 'NONE';
  const next: Reminder = { id, title: data.title, date: data.date, time: data.time, repeat,
    message: typeof data.message === 'string' ? data.message : '', enabled: data.enabled !== false,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(), lastTriggeredAt: null };
  const prior = existing?.lastTriggeredAt;
  if (prior != null && occurrenceOnDay(next, new Date(prior))?.getTime() === prior) next.lastTriggeredAt = prior;
  return next;
}
