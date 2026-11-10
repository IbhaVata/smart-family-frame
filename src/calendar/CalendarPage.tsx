import { useMemo, useState } from 'react';
import type { CalendarEvent } from '@/types';
import { useStore } from '@/app/store';
import { eventsStore, settingsStore, toast } from '@/app/stores';
import { minuteStore } from '@/services/ticker';
import { saveEvent, deleteEvent } from '@/services/dataService';
import { Button, Segmented, Modal, Field, TextInput, TextArea, Toggle, FormErrors, EmptyState, ConfirmDialog } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { validateEvent, eventsOnDay, upcomingEvents, buildMonthGrid, compareEvents } from './calendarLogic';
import { toDateKey, parseDateKey, formatClockTime, relativeDayLabel, MONTH_LONG, WEEKDAY_SHORT, formatLongDate, formatWeekday, addDays } from '@/utils/time';

type View = 'today' | 'upcoming' | 'month';

interface Draft {
  id?: string;
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  description: string;
}

function emptyDraft(date: string): Draft {
  return { title: '', date, allDay: false, startTime: '09:00', endTime: '10:00', description: '' };
}

function EventModal({ draft, onClose, onDelete }: { draft: Draft; onClose: () => void; onDelete?: () => void }) {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const errs = validateEvent({ title: d.title, date: d.date, allDay: d.allDay, startTime: d.startTime, endTime: d.endTime, description: d.description });
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await saveEvent({ id: d.id, title: d.title, date: d.date, allDay: d.allDay, startTime: d.allDay ? undefined : d.startTime, endTime: d.allDay ? undefined : d.endTime || undefined, description: d.description });
      toast(d.id ? 'Event updated.' : 'Event added.', 'success');
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={d.id ? 'Edit event' : 'New event'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <Button variant="ghost" icon="trash" className="left" onClick={onDelete}>Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <FormErrors errors={errors} />
        <Field label="Title">
          <TextInput value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Doctor appointment" maxLength={120} />
        </Field>
        <div className="input-row">
          <Field label="Date">
            <TextInput type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          </Field>
          <Field label="All day">
            <div style={{ height: 46, display: 'flex', alignItems: 'center' }}>
              <Toggle checked={d.allDay} onChange={(v) => setD({ ...d, allDay: v })} label={d.allDay ? 'Yes' : 'No'} />
            </div>
          </Field>
        </div>
        {!d.allDay && (
          <div className="input-row">
            <Field label="Start time">
              <TextInput type="time" value={d.startTime} onChange={(e) => setD({ ...d, startTime: e.target.value })} />
            </Field>
            <Field label="End time (optional)">
              <TextInput type="time" value={d.endTime} onChange={(e) => setD({ ...d, endTime: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label="Description (optional)">
          <TextArea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}

function EventItem({ e, onEdit, clockFormat, showDay, now }: { e: CalendarEvent; onEdit: () => void; clockFormat: '12h' | '24h'; showDay?: boolean; now: Date }) {
  const day = parseDateKey(e.date);
  return (
    <div className="list-item">
      <div className="li-time">{e.allDay || !e.startTime ? 'All day' : formatClockTime(e.startTime, clockFormat)}</div>
      <div className="li-main">
        <div className="li-title">{e.title}</div>
        <div className="li-sub">
          {showDay && day && <span>{relativeDayLabel(day, now)} · {formatLongDate(day)}</span>}
          {!e.allDay && e.endTime && <span>until {formatClockTime(e.endTime, clockFormat)}</span>}
          {e.description && <span>{e.description}</span>}
        </div>
      </div>
      <div className="li-actions">
        <Button icon="edit" iconOnly size="sm" aria-label="Edit" onClick={onEdit} />
      </div>
    </div>
  );
}

export function CalendarPage() {
  const events = useStore(eventsStore);
  const clockFormat = useStore(settingsStore).clockFormat;
  const now = useStore(minuteStore);
  const [view, setView] = useState<View>('today');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);
  const [cursor, setCursor] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [selectedDay, setSelectedDay] = useState<string>(toDateKey(now));

  const todays = useMemo(() => eventsOnDay(events, now), [events, now]);
  const upcoming = useMemo(() => upcomingEvents(events, now, 60), [events, now]);
  const grid = useMemo(() => buildMonthGrid(cursor.y, cursor.m, events, now), [cursor, events, now]);
  const selectedEvents = useMemo(() => events.filter((e) => e.date === selectedDay).sort(compareEvents), [events, selectedDay]);

  const edit = (e: CalendarEvent) => setDraft({ id: e.id, title: e.title, date: e.date, allDay: e.allDay, startTime: e.startTime ?? '09:00', endTime: e.endTime ?? '', description: e.description });

  const groupedUpcoming = useMemo(() => {
    const groups: { key: string; label: string; items: CalendarEvent[] }[] = [];
    for (const e of upcoming) {
      const last = groups[groups.length - 1];
      if (last && last.key === e.date) last.items.push(e);
      else {
        const d = parseDateKey(e.date);
        groups.push({ key: e.date, label: d ? `${relativeDayLabel(d, now)} · ${formatWeekday(d)}, ${formatLongDate(d)}` : e.date, items: [e] });
      }
    }
    return groups;
  }, [upcoming, now]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setDraft(null);
    await deleteEvent(id);
    toast('Event deleted.', 'info');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="sub">Local family calendar. Today and upcoming events also appear on the frame.</p>
        </div>
        <div className="page-actions">
          <Segmented value={view} onChange={setView} options={[{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'month', label: 'Month' }]} />
          <Button variant="primary" icon="plus" onClick={() => setDraft(emptyDraft(view === 'month' ? selectedDay : toDateKey(now)))}>Add event</Button>
        </div>
      </div>

      {view === 'today' && (
        <div className="stack">
          <div className="section-title">{formatWeekday(now)}, {formatLongDate(now)}</div>
          {todays.length === 0 ? (
            <EmptyState icon="calendar" title="Nothing planned today">
              <Button variant="primary" icon="plus" onClick={() => setDraft(emptyDraft(toDateKey(now)))}>Add an event</Button>
            </EmptyState>
          ) : (
            <div className="list">{todays.map((e) => <EventItem key={e.id} e={e} onEdit={() => edit(e)} clockFormat={clockFormat} now={now} />)}</div>
          )}
        </div>
      )}

      {view === 'upcoming' && (
        <div className="stack">
          {groupedUpcoming.length === 0 ? (
            <EmptyState icon="calendar" title="No upcoming events in the next 60 days" />
          ) : (
            groupedUpcoming.map((g) => (
              <div key={g.key} className="day-group">
                <h3>{g.label}</h3>
                <div className="list">{g.items.map((e) => <EventItem key={e.id} e={e} onEdit={() => edit(e)} clockFormat={clockFormat} now={now} />)}</div>
              </div>
            ))
          )}
        </div>
      )}

      {view === 'month' && (
        <div className="stack">
          <div className="row">
            <Button icon="chevron-left" iconOnly aria-label="Previous month" onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))} />
            <h2 style={{ minWidth: 200, textAlign: 'center' }}>{MONTH_LONG[cursor.m]} {cursor.y}</h2>
            <Button icon="chevron-right" iconOnly aria-label="Next month" onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))} />
            <Button size="sm" onClick={() => { setCursor({ y: now.getFullYear(), m: now.getMonth() }); setSelectedDay(toDateKey(now)); }}>Today</Button>
          </div>
          <div className="month-grid">
            {WEEKDAY_SHORT.map((d) => <div key={d} className="dow">{d}</div>)}
            {grid.map((c) => (
              <button
                type="button"
                key={c.key}
                className={`month-cell ${c.inMonth ? '' : 'out'} ${c.isToday ? 'today' : ''} ${c.key === selectedDay ? 'selected' : ''}`}
                onClick={() => setSelectedDay(c.key)}
                onDoubleClick={() => setDraft(emptyDraft(c.key))}
              >
                <span className="day-num">{c.date.getDate()}</span>
                {c.events.slice(0, 2).map((e) => <span key={e.id} className="ev">{e.title}</span>)}
                {c.events.length > 2 && <span className="ev more">+{c.events.length - 2} more</span>}
              </button>
            ))}
          </div>
          <div className="card">
            <div className="row">
              <h2>{(() => { const d = parseDateKey(selectedDay); return d ? `${relativeDayLabel(d, now)} · ${formatWeekday(d)}, ${formatLongDate(d)}` : selectedDay; })()}</h2>
              <span className="spacer" />
              <Button size="sm" icon="plus" onClick={() => setDraft(emptyDraft(selectedDay))}>Add event on this day</Button>
            </div>
            <div className="list" style={{ marginTop: 14 }}>
              {selectedEvents.length === 0 && <p className="muted">No events on this day. Double-click a day to add one.</p>}
              {selectedEvents.map((e) => <EventItem key={e.id} e={e} onEdit={() => edit(e)} clockFormat={clockFormat} now={now} />)}
            </div>
          </div>
        </div>
      )}

      {draft && <EventModal draft={draft} onClose={() => setDraft(null)} onDelete={draft.id ? () => setPendingDelete(events.find((e) => e.id === draft.id) ?? null) : undefined} />}
      {pendingDelete && <ConfirmDialog title="Delete event?" message={`"${pendingDelete.title}" will be removed.`} confirmLabel="Delete" danger onConfirm={() => void confirmDelete()} onCancel={() => setPendingDelete(null)} />}
      <p className="small faint"><Icon name="calendar" width={14} height={14} style={{ verticalAlign: '-2px' }} /> Tip: the frame's Calendar mode shows today's events and the next few days. {addDays(now, 1).getDate() ? '' : ''}</p>
    </div>
  );
}
