import { useStore, useStoreSelector } from '@/app/store';
import { settingsStore, photosStore, eventsStore, notesStore, remindersStore, navigate } from '@/app/stores';
import { minuteStore } from '@/services/ticker';
import { Button, ModeBadge } from '@/components/ui';
import { FrameContent, useFrameResolution } from './FrameContent';
import { enterFrameMode, describeNextChange } from './FrameMode';
import { eventsOnDay } from '@/calendar/calendarLogic';
import { frameNotes } from '@/notes/notesLogic';
import { formatClockTime } from '@/utils/time';
import { display } from '@/services/display/DisplayController';

export function FramePage() {
  const settings = useStore(settingsStore);
  const now = useStore(minuteStore);
  const res = useFrameResolution(null);
  const photoCount = useStoreSelector(photosStore, (p) => p.length);
  const events = useStore(eventsStore);
  const notes = useStore(notesStore);
  const reminderCount = useStoreSelector(remindersStore, (r) => r.filter((x) => x.enabled).length);
  const todayEvents = eventsOnDay(events, now).length;
  const pinned = frameNotes(notes, now).length;
  const nextChange = describeNextChange(now, settings.clockFormat);
  const caps = display.capabilities();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{settings.frameName}</h1>
          <p className="sub">Live preview of what the frame shows right now.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" size="lg" icon="fullscreen" onClick={() => void enterFrameMode()}>
            ENTER FRAME MODE
          </Button>
        </div>
      </div>

      <div className="frame-hero">
        <div className="preview-box" aria-label="Frame preview">
          <FrameContent />
        </div>
        <div className="stack">
          <div className="card">
            <div className="section-title">Now showing</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="status-big">{res.baseMode.charAt(0) + res.baseMode.slice(1).toLowerCase()}</span>
              <ModeBadge mode={res.baseMode} />
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {res.baseSource === 'schedule' && res.schedule
                ? `Schedule "${res.schedule.name}" (${formatClockTime(res.schedule.startTime, settings.clockFormat)} – ${formatClockTime(res.schedule.endTime, settings.clockFormat)})`
                : 'Default frame mode (no schedule is active)'}
            </p>
            {nextChange && <p className="small faint" style={{ marginTop: 4 }}>Next change {nextChange}</p>}
          </div>
          <div className="stat-grid">
            <button type="button" className="stat" onClick={() => navigate('photos')}>
              <div className="stat-n">{photoCount}</div>
              <div className="stat-l">Photos</div>
            </button>
            <button type="button" className="stat" onClick={() => navigate('calendar')}>
              <div className="stat-n">{todayEvents}</div>
              <div className="stat-l">Events today</div>
            </button>
            <button type="button" className="stat" onClick={() => navigate('notes')}>
              <div className="stat-n">{pinned}</div>
              <div className="stat-l">Notes on frame</div>
            </button>
            <button type="button" className="stat" onClick={() => navigate('reminders')}>
              <div className="stat-n">{reminderCount}</div>
              <div className="stat-l">Active reminders</div>
            </button>
          </div>
          <div className="card">
            <h2>Using the frame</h2>
            <ul className="muted small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Move the browser window onto the Acer monitor, then press ENTER FRAME MODE.</li>
              <li>Move the mouse to show controls; press Esc to leave.</li>
              <li>Left / right arrows change photo; space pauses.</li>
              <li>{caps.wakeLock ? 'The screen is kept awake while the frame runs.' : 'This browser cannot keep the screen awake: set Mac display sleep to Never (see README).'}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
