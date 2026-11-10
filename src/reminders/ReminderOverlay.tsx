import { useEffect } from 'react';
import { useStore, useStoreSelector } from '@/app/store';
import { activeRemindersStore, settingsStore } from '@/app/stores';
import { dismissActiveReminder } from '@/hooks/useReminderEngine';
import { Icon } from '@/components/Icon';
import { formatClockTime } from '@/utils/time';

/** Large full-screen reminder. Rendered above BOTH management and frame mode. */
export function ReminderOverlay() {
  const active = useStore(activeRemindersStore);
  const clockFormat = useStoreSelector(settingsStore, (s) => s.clockFormat);
  const first = active[0];

  useEffect(() => {
    if (!first) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        dismissActiveReminder(first.reminder.id, first.occurrenceAt);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [first]);

  if (!first) return null;
  const { reminder } = first;
  return (
    <div className="reminder-overlay" role="alertdialog" aria-label={`Reminder: ${reminder.title}`}>
      <div className="reminder-card">
        <div className="rc-eyebrow">
          <Icon name="bell" /> Reminder
        </div>
        <div className="rc-title">{reminder.title}</div>
        <div className="rc-time">{formatClockTime(reminder.time, clockFormat)}</div>
        {reminder.message && <div className="rc-msg">{reminder.message}</div>}
        <button type="button" className="rc-dismiss" onClick={() => dismissActiveReminder(reminder.id, first.occurrenceAt)} autoFocus>
          Dismiss
        </button>
        {active.length > 1 && <div className="rc-more">{active.length - 1} more reminder{active.length > 2 ? 's' : ''} waiting</div>}
      </div>
    </div>
  );
}
