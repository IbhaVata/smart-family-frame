import type { CalendarEvent } from '@/types';
import { parseDateKey, parseHHMM, toDateKey, startOfDay, addDays, combineDateTime } from '@/utils/time';

export interface EventInput {
  title: string;
  date: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  description: string;
}

export function validateEvent(input: EventInput): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push('Give the event a title.');
  if (!parseDateKey(input.date)) errors.push('Pick a valid date.');
  if (!input.allDay) {
    const s = parseHHMM(input.startTime ?? '');
    if (s === null) errors.push('Start time must be HH:MM.');
    if (input.endTime) {
      const e = parseHHMM(input.endTime);
      if (e === null) errors.push('End time must be HH:MM.');
      else if (s !== null && e < s) errors.push('End time must be after start time.');
    }
  }
  return errors;
}

export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const sa = parseHHMM(a.startTime ?? '') ?? 0;
  const sb = parseHHMM(b.startTime ?? '') ?? 0;
  if (sa !== sb) return sa - sb;
  return a.title.localeCompare(b.title);
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const key = toDateKey(day);
  return events.filter((e) => e.date === key).sort(compareEvents);
}

/** Events from today up to `days` days ahead, sorted. */
export function upcomingEvents(events: CalendarEvent[], now: Date, days = 30): CalendarEvent[] {
  const from = toDateKey(startOfDay(now));
  const to = toDateKey(addDays(startOfDay(now), days));
  return events.filter((e) => e.date >= from && e.date <= to).sort(compareEvents);
}

/** The start timestamp of an event (all-day events start at midnight). */
export function eventStartMs(e: CalendarEvent): number | null {
  const day = parseDateKey(e.date);
  if (!day) return null;
  if (e.allDay || !e.startTime) return day.getTime();
  const dt = combineDateTime(e.date, e.startTime);
  return dt ? dt.getTime() : day.getTime();
}

export function eventEndMs(e: CalendarEvent): number | null {
  const day = parseDateKey(e.date);
  if (!day) return null;
  if (e.allDay) return addDays(day, 1).getTime();
  const end = e.endTime ? combineDateTime(e.date, e.endTime) : null;
  if (end) return end.getTime();
  const start = eventStartMs(e);
  return start === null ? null : start + 60 * 60 * 1000;
}

/** The next event that has not finished yet (all-day events count for the whole day). */
export function nextEvent(events: CalendarEvent[], now: Date): CalendarEvent | null {
  const nowMs = now.getTime();
  const candidates = events
    .filter((e) => {
      const end = eventEndMs(e);
      return end !== null && end > nowMs;
    })
    .sort(compareEvents);
  return candidates[0] ?? null;
}

export interface MonthCell {
  date: Date;
  key: string;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

/** 6x7 grid starting on Sunday for the given month. */
export function buildMonthGrid(year: number, month0: number, events: CalendarEvent[], now: Date): MonthCell[] {
  const first = new Date(year, month0, 1);
  const start = addDays(first, -first.getDay());
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    const key = toDateKey(date);
    cells.push({
      date,
      key,
      inMonth: date.getMonth() === month0,
      isToday: key === toDateKey(now),
      events: (byDate.get(key) ?? []).sort(compareEvents),
    });
  }
  return cells;
}
