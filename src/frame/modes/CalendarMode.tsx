import { useMemo } from 'react';
import type { CalendarEvent, Settings } from '@/types';
import { useClock } from '@/hooks/useClock';
import { eventsOnDay, upcomingEvents } from '@/calendar/calendarLogic';
import { formatWeekday, MONTH_LONG, formatClockTime, relativeDayLabel, parseDateKey, toDateKey } from '@/utils/time';
import { InlineTime } from '@/clock/ClockDisplay';

function EventRow({ e, settings, showDay, now }: { e: CalendarEvent; settings: Settings; showDay?: boolean; now: Date }) {
  const day = parseDateKey(e.date);
  const isToday = e.date === toDateKey(now);
  return (
    <div className={`cal-event ${isToday ? 'today' : ''}`}>
      <div className="ev-time">{e.allDay || !e.startTime ? 'All day' : formatClockTime(e.startTime, settings.clockFormat)}</div>
      <div className="ev-title">{e.title}</div>
      {showDay && day && <div className="ev-day">{relativeDayLabel(day, now)}</div>}
    </div>
  );
}

export function CalendarMode({ events, settings }: { events: CalendarEvent[]; settings: Settings }) {
  const now = useClock(false);
  const todays = useMemo(() => eventsOnDay(events, now), [events, now]);
  const upcoming = useMemo(() => upcomingEvents(events, now, 14).filter((e) => e.date !== toDateKey(now)).slice(0, 5), [events, now]);
  const maxToday = 5;
  return (
    <div className="mode calendar-mode">
      <div className="cal-left">
        <div className="cal-weekday">{formatWeekday(now)}</div>
        <div className="cal-daynum">{now.getDate()}</div>
        <div className="cal-month">
          {MONTH_LONG[now.getMonth()]} {now.getFullYear()}
        </div>
        <InlineTime settings={settings} className="cal-time" />
      </div>
      <div className="cal-right">
        <div>
          <div className="cal-section-title">Today</div>
          <div className="cal-list" style={{ marginTop: 'calc(var(--fu) * 0.6)' }}>
            {todays.length === 0 && <div className="cal-empty">Nothing planned today</div>}
            {todays.slice(0, maxToday).map((e) => (
              <EventRow key={e.id} e={e} settings={settings} now={now} />
            ))}
            {todays.length > maxToday && <div className="cal-empty" style={{ fontSize: 'calc(var(--fu) * 1.3)' }}>+ {todays.length - maxToday} more</div>}
          </div>
        </div>
        {upcoming.length > 0 && (
          <div>
            <div className="cal-section-title">Coming up</div>
            <div className="cal-list" style={{ marginTop: 'calc(var(--fu) * 0.6)' }}>
              {upcoming.map((e) => (
                <EventRow key={e.id} e={e} settings={settings} showDay now={now} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
