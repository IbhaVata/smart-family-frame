import { useMemo } from 'react';
import type { CalendarEvent, Note, PhotoMeta, Settings } from '@/types';
import { Slideshow } from '@/photos/Slideshow';
import { useClock } from '@/hooks/useClock';
import { clockParts } from '@/clock/clockFormat';
import { nextEvent } from '@/calendar/calendarLogic';
import { frameNotes } from '@/notes/notesLogic';
import { formatWeekday, formatLongDate, formatClockTime, parseDateKey, relativeDayLabel } from '@/utils/time';
import { useStore } from '@/app/store';
import { householdEntriesStore, householdPaymentsStore, householdServicesStore } from '@/app/stores';
import { toDateKey } from '@/utils/time';

function DashClock({ settings }: { settings: Settings }) {
  const now = useClock(settings.showSeconds);
  const p = clockParts(now, settings.clockFormat);
  return (
    <div>
      <div className="dash-time">
        <span>{p.time}</span>
        {settings.showSeconds && <span style={{ fontSize: '0.4em', fontWeight: 300, marginLeft: '0.2em', color: 'var(--f-ink-2)' }}>{p.seconds}</span>}
        {p.meridiem && <span className="meridiem">{p.meridiem}</span>}
      </div>
      {settings.showDate && (
        <>
          <div className="dash-weekday" style={{ marginTop: 'calc(var(--fu) * 0.8)' }}>{formatWeekday(now)}</div>
          <div className="dash-date">{formatLongDate(now)}</div>
        </>
      )}
    </div>
  );
}

export function DashboardMode({ photos, events, notes, settings }: { photos: PhotoMeta[]; events: CalendarEvent[]; notes: Note[]; settings: Settings }) {
  const now = useClock(false);
  const next = useMemo(() => nextEvent(events, now), [events, now]);
  const note = useMemo(() => frameNotes(notes, now)[0] ?? null, [notes, now]);
  const nextDay = next ? parseDateKey(next.date) : null;
  const householdServices = useStore(householdServicesStore);
  const householdEntries = useStore(householdEntriesStore);
  const householdPayments = useStore(householdPaymentsStore);
  const householdNotice = useMemo(() => {
    if (!settings.showHouseholdOnFrame) return null;
    const today = toDateKey(now);
    const leave = householdEntries.find((e) => e.date === today && (e.attendance === 'LEAVE' || e.attendance === 'ABSENT'));
    if (leave) return `${householdServices.find((s) => s.id === leave.serviceId)?.name ?? 'Household service'} is away today`;
    const pending = householdPayments.find((p) => p.status !== 'PAID');
    return pending ? `${householdServices.find((s) => s.id === pending.serviceId)?.name ?? 'Household'} payment pending` : null;
  }, [settings.showHouseholdOnFrame, now, householdEntries, householdPayments, householdServices]);
  return (
    <div className="mode dashboard-mode">
      <div className="dash-photo">
        <Slideshow photos={photos} settings={settings} emptyTitle="Add family photos" emptyHint="They will appear here, large and beautiful." />
      </div>
      <div className="dash-side">
        <DashClock settings={settings} />
        <div className="dash-block">
          <div className="db-label">Next up</div>
          {next ? (
            <>
              <div className="db-title">{next.title}</div>
              <div className="db-sub">
                {nextDay ? relativeDayLabel(nextDay, now) : next.date}
                {!next.allDay && next.startTime ? ` at ${formatClockTime(next.startTime, settings.clockFormat)}` : ', all day'}
              </div>
            </>
          ) : (
            <div className="db-empty">No upcoming events</div>
          )}
        </div>
        {householdNotice && <div className="dash-block"><div className="db-label">Household</div><div className="db-msg">{householdNotice}</div></div>}
        <div className="dash-block">
          <div className="db-label">Note</div>
          {note ? (
            <>
              {note.title && <div className="db-title">{note.title}</div>}
              {note.message && <div className="db-msg">{note.message}</div>}
            </>
          ) : (
            <div className="db-empty">No pinned notes</div>
          )}
        </div>
        <div className="dash-frame-name">{settings.frameName}</div>
      </div>
    </div>
  );
}
