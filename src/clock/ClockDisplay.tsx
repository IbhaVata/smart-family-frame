import { memo } from 'react';
import type { Settings } from '@/types';
import { useClock } from '@/hooks/useClock';
import { clockParts } from './clockFormat';
import { formatWeekday, formatLongDate } from '@/utils/time';

/**
 * Self-updating clock pieces. Each component subscribes to its own second/minute tick so nothing else
 * in the frame re-renders when the time changes.
 */

export const BigClock = memo(function BigClock({ settings }: { settings: Pick<Settings, 'clockFormat' | 'showSeconds'> }) {
  const now = useClock(settings.showSeconds);
  const p = clockParts(now, settings.clockFormat);
  return (
    <div className="clock-big" aria-live="off">
      <span>{p.time}</span>
      {settings.showSeconds && <span className="seconds">{p.seconds}</span>}
      {p.meridiem && <span className="meridiem">{p.meridiem}</span>}
    </div>
  );
});

export const DateLine = memo(function DateLine({ className = 'clock-date-line' }: { className?: string }) {
  const now = useClock(false);
  return (
    <div className={className}>
      <div className="weekday">{formatWeekday(now)}</div>
      <div className="fulldate">{formatLongDate(now)}</div>
    </div>
  );
});

/** Compact "4:05 PM" + date for corners (photos mode). */
export const CornerClock = memo(function CornerClock({ settings }: { settings: Pick<Settings, 'clockFormat' | 'showSeconds' | 'showDate'> }) {
  const now = useClock(settings.showSeconds);
  const p = clockParts(now, settings.clockFormat);
  return (
    <div className="photo-clock">
      <div className="clock-time">
        {p.time}
        {settings.showSeconds && <span style={{ fontSize: '0.45em', fontWeight: 400 }}>:{p.seconds}</span>}
        {p.meridiem && <span className="meridiem">{p.meridiem}</span>}
      </div>
      {settings.showDate && (
        <div className="clock-date">
          {formatWeekday(now)}, {formatLongDate(now)}
        </div>
      )}
    </div>
  );
});

export const InlineTime = memo(function InlineTime({ settings, className }: { settings: Pick<Settings, 'clockFormat' | 'showSeconds'>; className?: string }) {
  const now = useClock(settings.showSeconds);
  const p = clockParts(now, settings.clockFormat);
  return (
    <div className={className}>
      <span>{p.time}</span>
      {settings.showSeconds && <span style={{ fontSize: '0.5em', fontWeight: 300, marginLeft: '0.15em' }}>{p.seconds}</span>}
      {p.meridiem && <span className="meridiem">{p.meridiem}</span>}
    </div>
  );
});
