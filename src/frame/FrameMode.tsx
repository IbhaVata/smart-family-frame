import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrameModeKind } from '@/types';
import { FRAME_MODES } from '@/types';
import { setScreen, schedulesStore, settingsStore, activeRemindersStore } from '@/app/stores';
import { useStore, useStoreSelector } from '@/app/store';
import { display } from '@/services/display/DisplayController';
import { FrameContent, useFrameResolution } from './FrameContent';
import { slideshowBus, slideshowPausedStore, togglePaused, setPaused } from '@/photos/slideshowBus';
import { Icon } from '@/components/Icon';
import { nextScheduleBoundary } from '@/scheduler/scheduler';
import { formatClockTime, toDateKey, pad2, parseDateKey, relativeDayLabel } from '@/utils/time';
import { rememberFrameActive } from './frameSession';

const IDLE_MS = 3500;

/** Call from a user gesture (click) so the browser allows fullscreen. */
export async function enterFrameMode(): Promise<void> {
  setPaused(false);
  rememberFrameActive(true);
  setScreen('frame');
  await display.enterFullscreen();
}

/** Leaves the frame on purpose (Esc / Exit): the frame will not auto-resume after the next reload. */
export async function exitFrameMode(): Promise<void> {
  rememberFrameActive(false);
  await display.exitFullscreen();
  setScreen('manage');
}

export function describeNextChange(now: Date, clockFormat: '12h' | '24h'): string | null {
  const boundary = nextScheduleBoundary(schedulesStore.get(), now);
  if (!boundary) return null;
  const time = formatClockTime(`${pad2(boundary.getHours())}:${pad2(boundary.getMinutes())}`, clockFormat);
  if (toDateKey(boundary) === toDateKey(now)) return time;
  // relativeDayLabel already says "Tomorrow" only when it truly is tomorrow, otherwise a weekday
  // name or short date - so a weekdays-only schedule on a Friday says "Monday 8:00 AM", not
  // a false "tomorrow 8:00 AM".
  const day = parseDateKey(toDateKey(boundary));
  const label = day ? relativeDayLabel(day, now) : toDateKey(boundary);
  return `${label} ${time}`;
}

export function FrameMode() {
  const [override, setOverride] = useState<FrameModeKind | null>(null);
  const [controls, setControls] = useState(false);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => display.isFullscreen());
  const idleTimer = useRef(0);
  const paused = useStore(slideshowPausedStore);
  const res = useFrameResolution(override);
  const clockFormat = useStoreSelector(settingsStore, (s) => s.clockFormat);

  const wake = useCallback(() => {
    setControls(true);
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setControls(false);
      setIdle(true);
    }, IDLE_MS);
  }, []);

  useEffect(() => {
    document.body.classList.add('in-frame');
    void display.acquireWakeLock();
    // Losing browser fullscreen is NOT the same as the user wanting to leave the frame: on a 24/7
    // kiosk, the display can power-cycle, the OS can drop fullscreen for a dialog, or the monitor
    // can be unplugged/replugged, all without a person pressing anything. In every one of those
    // cases the frame must keep showing its content (the .frame-screen already fills the window)
    // and simply offer a way back into fullscreen; only the explicit Esc/Exit handlers below leave
    // frame mode.
    const unsubFs = display.onFullscreenChange((fs) => setFullscreen(fs));
    const onKey = (e: KeyboardEvent) => {
      // A reminder overlay owns the keyboard while it is up (Enter dismisses it there); do not let
      // frame-mode shortcuts fight it - Space in particular must not toggle pause while it is meant
      // to activate the focused Dismiss button.
      if (activeRemindersStore.get().length > 0) return;
      switch (e.key) {
        case 'Escape':
          void exitFrameMode();
          break;
        case 'ArrowRight':
          slideshowBus.emit('next');
          wake();
          break;
        case 'ArrowLeft':
          slideshowBus.emit('prev');
          wake();
          break;
        default:
          if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
            e.preventDefault();
            togglePaused();
            wake();
          }
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    // Start hidden: show controls only on interaction.
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
    return () => {
      document.body.classList.remove('in-frame');
      clearTimeout(idleTimer.current);
      window.removeEventListener('keydown', onKey);
      unsubFs();
      void display.releaseWakeLock();
      setPaused(false);
    };
  }, [wake]);

  const nextChange = controls ? describeNextChange(new Date(), clockFormat) : null;
  const showsPhotos = res.baseMode === 'PHOTOS' || res.baseMode === 'DASHBOARD';

  return (
    <div className={`frame-screen ${idle ? 'idle' : ''} ${controls ? 'controls-visible' : ''}`} onMouseMove={wake} onPointerDown={wake} onTouchStart={wake}>
      <FrameContent override={override} />
      <div className={`frame-controls ${controls ? 'visible' : ''}`} aria-hidden={!controls}>
        {showsPhotos && (
          <div className="fc-group">
            <button type="button" className="fc-btn" onClick={() => slideshowBus.emit('prev')} aria-label="Previous photo" title="Previous (left arrow)">
              <Icon name="prev" />
            </button>
            <button type="button" className="fc-btn" onClick={togglePaused} aria-label={paused ? 'Resume' : 'Pause'} title="Pause / resume (space)">
              <Icon name={paused ? 'play' : 'pause'} />
            </button>
            <button type="button" className="fc-btn" onClick={() => slideshowBus.emit('next')} aria-label="Next photo" title="Next (right arrow)">
              <Icon name="next" />
            </button>
          </div>
        )}
        <div className="fc-group" role="group" aria-label="Frame mode">
          <button type="button" className={`fc-btn ${override === null ? 'active' : ''}`} onClick={() => setOverride(null)} title="Follow the schedule">
            Auto
          </button>
          {FRAME_MODES.map((m) => (
            <button key={m} type="button" className={`fc-btn ${override === m ? 'active' : ''}`} onClick={() => setOverride(m)}>
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <span className="fc-info">
          {res.baseSource === 'schedule' && res.schedule ? `Schedule: ${res.schedule.name}` : res.baseSource === 'override' ? 'Manual' : 'Default mode'}
          {nextChange && override === null ? ` - next change ${nextChange}` : ''}
        </span>
        <span className="spacer" />
        {!fullscreen && (
          <button type="button" className="fc-btn" onClick={() => void display.enterFullscreen()} title="Go fullscreen on this display">
            <Icon name="fullscreen" /> Fullscreen
          </button>
        )}
        <button type="button" className="fc-btn" onClick={() => void exitFrameMode()} title="Exit frame mode (Esc)">
          <Icon name="exit" /> Exit
        </button>
      </div>
    </div>
  );
}
