/**
 * Minimal date helpers needed by shared/household/calculations.ts. Deliberately NOT the same file as
 * src/utils/time.ts (which has many more UI-facing formatters): touching that file for every V2
 * consumer would add V1 regression risk for no benefit, and these three functions are simple,
 * stable date arithmetic rather than business logic — unlike the household payment formulas, which
 * live in exactly one place (this directory) on purpose. Local time only, matching V1.
 */

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
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

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
