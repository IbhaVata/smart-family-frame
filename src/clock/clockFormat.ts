import type { ClockFormat } from '@/types';
import { pad2 } from '@/utils/time';

export interface ClockParts {
  /** "4:05" or "16:05" */
  time: string;
  hours: string;
  minutes: string;
  seconds: string;
  /** "AM" / "PM" or "" in 24h mode */
  meridiem: string;
}

export function clockParts(d: Date, format: ClockFormat): ClockParts {
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  if (format === '24h') {
    return { time: `${pad2(h)}:${pad2(m)}`, hours: pad2(h), minutes: pad2(m), seconds: pad2(s), meridiem: '' };
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { time: `${h12}:${pad2(m)}`, hours: String(h12), minutes: pad2(m), seconds: pad2(s), meridiem: h < 12 ? 'AM' : 'PM' };
}

export function formatClock(d: Date, format: ClockFormat, showSeconds: boolean): string {
  const p = clockParts(d, format);
  const base = showSeconds ? `${p.time}:${p.seconds}` : p.time;
  return p.meridiem ? `${base} ${p.meridiem}` : base;
}
