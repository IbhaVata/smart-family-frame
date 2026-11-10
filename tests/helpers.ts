import type { Schedule, Reminder, FrameModeKind, RepeatRule } from '@/types';

export function at(dateKey: string, hhmm: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, h, mi, 0, 0);
}

let counter = 0;
export function schedule(over: Partial<Schedule> & { mode: FrameModeKind; startTime: string; endTime: string }): Schedule {
  counter++;
  return {
    id: over.id ?? `s${counter}`,
    name: over.name ?? `Schedule ${counter}`,
    daysOfWeek: over.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    enabled: over.enabled ?? true,
    priority: over.priority ?? 0,
    mode: over.mode,
    startTime: over.startTime,
    endTime: over.endTime,
  };
}

export function reminder(over: Partial<Reminder> & { date: string; time: string; repeat: RepeatRule }): Reminder {
  counter++;
  return {
    id: over.id ?? `r${counter}`,
    title: over.title ?? `Reminder ${counter}`,
    message: over.message ?? '',
    enabled: over.enabled ?? true,
    lastTriggeredAt: over.lastTriggeredAt ?? null,
    createdAt: 0,
    updatedAt: 0,
    date: over.date,
    time: over.time,
    repeat: over.repeat,
  };
}

/** Deterministic pseudo-random generator for shuffle tests. */
export function seededRng(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
