import { useEffect } from 'react';
import { useStore } from '@/app/store';
import { minuteStore } from '@/services/ticker';
import { remindersStore, activeRemindersStore } from '@/app/stores';
import { runReminderTick } from '@/reminders/reminderEngine';
import { markReminderTriggered } from '@/services/dataService';

/**
 * Runs once per minute (shared ticker) and whenever data changes: fires due reminders exactly once
 * per occurrence and auto-dismisses overlays that were left on screen too long.
 * All decisions are made by the pure runReminderTick (see tests/reminders.torture.test.ts).
 */
export function useReminderEngine(enabled = true): void {
  const tick = useStore(minuteStore);
  useEffect(() => {
    if (!enabled) return;
    const now = new Date();
    const result = runReminderTick(remindersStore.get(), activeRemindersStore.get(), now);
    for (const d of result.fire) void markReminderTriggered(d.reminder.id, d.occurrenceAt);
    if (result.changed) activeRemindersStore.set(result.active);
  }, [tick, enabled]);
}

export function dismissActiveReminder(id: string, occurrenceAt: number): void {
  activeRemindersStore.set((list) => list.filter((a) => !(a.reminder.id === id && a.occurrenceAt === occurrenceAt)));
}
