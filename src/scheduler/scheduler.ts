import type { Schedule, FrameModeKind } from '@/types';
import { FRAME_MODES } from '@/types';
import { parseHHMM, minutesOfDay, MINUTES_PER_DAY } from '@/utils/time';

/**
 * Pure scheduling logic. No timers, no React, no storage.
 *
 * Rules (deterministic, never random):
 *  1. A schedule is active only if it is enabled, has at least one day, and "now" is inside its window.
 *  2. Windows where startTime < endTime are same-day windows: [start, end).
 *  3. Windows where startTime > endTime cross midnight (e.g. 23:00 -> 06:30). The schedule's day is the
 *     day the window STARTS on: it covers [start, 24:00) of that day and [00:00, end) of the following day.
 *  4. startTime === endTime means "all day" (24 hours) on the listed days.
 *  5. When several schedules are active, the highest priority wins. Ties are broken by the shorter
 *     window (more specific), then by name, then by id, so the result is always the same.
 */

export function scheduleDurationMinutes(s: Pick<Schedule, 'startTime' | 'endTime'>): number {
  const start = parseHHMM(s.startTime);
  const end = parseHHMM(s.endTime);
  if (start === null || end === null) return 0;
  if (start === end) return MINUTES_PER_DAY;
  return ((end - start) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function crossesMidnight(s: Pick<Schedule, 'startTime' | 'endTime'>): boolean {
  const start = parseHHMM(s.startTime);
  const end = parseHHMM(s.endTime);
  return start !== null && end !== null && start > end;
}

export function isScheduleActiveAt(s: Schedule, now: Date): boolean {
  if (!s.enabled) return false;
  if (!Array.isArray(s.daysOfWeek) || s.daysOfWeek.length === 0) return false;
  const start = parseHHMM(s.startTime);
  const end = parseHHMM(s.endTime);
  if (start === null || end === null) return false;
  const t = minutesOfDay(now);
  const day = now.getDay();
  const prevDay = (day + 6) % 7;
  const onDay = s.daysOfWeek.includes(day);
  if (start === end) return onDay;
  if (start < end) return onDay && t >= start && t < end;
  // crosses midnight
  return (onDay && t >= start) || (s.daysOfWeek.includes(prevDay) && t < end);
}

export function compareSchedules(a: Schedule, b: Schedule): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const da = scheduleDurationMinutes(a);
  const db = scheduleDurationMinutes(b);
  if (da !== db) return da - db;
  const n = a.name.localeCompare(b.name);
  if (n !== 0) return n;
  return a.id.localeCompare(b.id);
}

export function activeSchedulesAt(schedules: Schedule[], now: Date): Schedule[] {
  return schedules.filter((s) => isScheduleActiveAt(s, now)).sort(compareSchedules);
}

export function resolveActiveSchedule(schedules: Schedule[], now: Date): Schedule | null {
  return activeSchedulesAt(schedules, now)[0] ?? null;
}

export type ModeSource = 'override' | 'schedule' | 'default';

export interface FrameResolution {
  /** The full-screen content to show. */
  baseMode: FrameModeKind;
  baseSource: ModeSource;
  schedule: Schedule | null;
  /** A reminder overlay always takes precedence over whatever the schedule says. */
  overlay: 'REMINDER' | null;
}

export interface ResolveInput {
  schedules: Schedule[];
  now: Date;
  defaultMode: FrameModeKind;
  /** Manual override chosen from the frame controls; wins over schedules until cleared. */
  override?: FrameModeKind | null;
  hasActiveReminder?: boolean;
}

export function resolveFrameMode(input: ResolveInput): FrameResolution {
  const overlay = input.hasActiveReminder ? 'REMINDER' : null;
  if (input.override) {
    return { baseMode: input.override, baseSource: 'override', schedule: null, overlay };
  }
  const schedule = resolveActiveSchedule(input.schedules, input.now);
  if (schedule) return { baseMode: schedule.mode, baseSource: 'schedule', schedule, overlay };
  return { baseMode: input.defaultMode, baseSource: 'default', schedule: null, overlay };
}

/** The next Date (strictly after `now`) at which some enabled schedule starts or ends. Useful for UI hints. */
export function nextScheduleBoundary(schedules: Schedule[], now: Date): Date | null {
  const candidates: number[] = [];
  const t = minutesOfDay(now);
  for (const s of schedules) {
    if (!s.enabled || s.daysOfWeek.length === 0) continue;
    for (const raw of [s.startTime, s.endTime]) {
      const m = parseHHMM(raw);
      if (m === null) continue;
      for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        if (dayOffset === 0 && m <= t) continue;
        // Build the candidate from LOCAL calendar fields (never epoch + n*86400000): days are not always
        // 24 hours long on daylight-saving transition days.
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, Math.floor(m / 60), m % 60, 0, 0);
        const when = d.getTime();
        if (when <= now.getTime()) continue;
        const before = new Date(when - 60000);
        if (isScheduleActiveAt(s, d) !== isScheduleActiveAt(s, before)) {
          candidates.push(when);
          break;
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates));
}

export interface ScheduleInput {
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  mode: FrameModeKind;
  priority: number;
}

export function validateSchedule(input: ScheduleInput): string[] {
  const errors: string[] = [];
  if (!input.name || !input.name.trim()) errors.push('Give the schedule a name.');
  if (parseHHMM(input.startTime) === null) errors.push('Start time must be HH:MM (24-hour).');
  if (parseHHMM(input.endTime) === null) errors.push('End time must be HH:MM (24-hour).');
  if (!Array.isArray(input.daysOfWeek) || input.daysOfWeek.length === 0) errors.push('Pick at least one day.');
  else if (input.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('Days must be 0-6.');
  if (!FRAME_MODES.includes(input.mode)) errors.push('Choose a valid frame mode.');
  if (!Number.isFinite(input.priority)) errors.push('Priority must be a number.');
  return errors;
}

export interface TimelineSegment {
  startMin: number;
  endMin: number;
  mode: FrameModeKind;
  schedule: Schedule | null;
}

/** Resolves every minute of a given day into merged segments (used for the visual schedule strip). */
export function computeDayTimeline(schedules: Schedule[], day: Date, defaultMode: FrameModeKind): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const probe = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  let current: TimelineSegment | null = null;
  for (let m = 0; m < MINUTES_PER_DAY; m++) {
    probe.setHours(Math.floor(m / 60), m % 60, 0, 0);
    const s = resolveActiveSchedule(schedules, probe);
    const mode = s ? s.mode : defaultMode;
    const sameAsCurrent = current && current.mode === mode && (current.schedule?.id ?? null) === (s?.id ?? null);
    if (sameAsCurrent && current) {
      current.endMin = m + 1;
    } else {
      current = { startMin: m, endMin: m + 1, mode, schedule: s };
      segments.push(current);
    }
  }
  return segments;
}
