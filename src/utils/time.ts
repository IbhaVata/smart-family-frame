/** Time and date helpers. Everything is LOCAL time; the frame lives in one room. */

export const MINUTES_PER_DAY = 1440;
export const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseHHMM(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = HHMM_RE.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatHHMM(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parses YYYY-MM-DD into a local-midnight Date. Returns null for invalid dates (e.g. 2026-02-30). */
export function parseDateKey(value: string | undefined | null): Date | null {
  if (!value) return null;
  const m = DATE_KEY_RE.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d, 0, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function isValidDateKey(value: string | undefined | null): boolean {
  return parseDateKey(value) !== null;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Combines a date key and HH:MM into a local Date. */
export function combineDateTime(dateKey: string, hhmm: string): Date | null {
  const day = parseDateKey(dateKey);
  const mins = parseHHMM(hhmm);
  if (!day || mins === null) return null;
  day.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return day;
}

/** Formats HH:MM to a friendly 12h or 24h string, e.g. "4:00 PM" or "16:00". */
export function formatClockTime(hhmm: string, format: '12h' | '24h'): string {
  const mins = parseHHMM(hhmm);
  if (mins === null) return hhmm;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (format === '24h') return `${pad2(h)}:${pad2(m)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tuesday" */
export function formatWeekday(d: Date): string {
  return WEEKDAY_LONG[d.getDay()] ?? '';
}

/** "15 September 2026" */
export function formatLongDate(d: Date): string {
  return `${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Tue, 15 Sep" */
export function formatShortDate(d: Date): string {
  return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/** Relative day label: Today / Tomorrow / weekday name / short date */
export function relativeDayLabel(day: Date, now: Date): string {
  const a = startOfDay(day).getTime();
  const b = startOfDay(now).getTime();
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return formatWeekday(day);
  return formatShortDate(day);
}

/** Milliseconds until the next boundary of `unitMs` (e.g. next full second or minute). */
export function msUntilNextBoundary(now: number, unitMs: number): number {
  const r = unitMs - (now % unitMs);
  return r <= 0 ? unitMs : r;
}
