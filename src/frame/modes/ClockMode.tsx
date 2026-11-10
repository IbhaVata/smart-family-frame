import type { Settings } from '@/types';
import { BigClock, DateLine } from '@/clock/ClockDisplay';

export function ClockMode({ settings }: { settings: Settings }) {
  return (
    <div className={`mode clock-mode style-${settings.clockStyle}`}>
      <BigClock settings={settings} />
      {settings.showDate && <DateLine />}
      {settings.clockStyle === 'digital' && <div className="clock-frame-name">{settings.frameName}</div>}
    </div>
  );
}
