import type { Settings } from '@/types';
import { BigClock } from '@/clock/ClockDisplay';
import { useClock } from '@/hooks/useClock';
import { formatWeekday, formatLongDate } from '@/utils/time';

function NightDate() {
  const now = useClock(false);
  return (
    <div className="night-date">
      {formatWeekday(now)} - {formatLongDate(now)}
    </div>
  );
}

/**
 * NIGHT mode. "Black screen" paints the whole frame true black; "Night clock" shows a very dim clock.
 * Note: a web page cannot power the monitor off - see services/display/DisplayController.ts.
 */
export function NightMode({ settings }: { settings: Settings }) {
  if (settings.nightModeType === 'black') {
    return <div className="mode night-black" aria-label="Night mode (screen dark)" />;
  }
  return (
    <div className="mode night-clock">
      <BigClock settings={{ clockFormat: settings.clockFormat, showSeconds: false }} />
      {settings.showDate && <NightDate />}
    </div>
  );
}
