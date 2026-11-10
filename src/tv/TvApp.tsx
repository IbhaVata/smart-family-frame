import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '@/app/store';
import { activeRemindersStore, eventsStore, notesStore, photosStore, remindersStore, schedulesStore, settingsStore, statusStore } from '@/app/stores';
import { FrameContent, useFrameResolution } from '@/frame/FrameContent';
import { RemoteSharingSection } from '@/settings/RemoteSharingSection';
import { updateSettings } from '@/services/dataService';
import { loadDemoData } from '@/services/demoData';
import { FRAME_MODES, type FrameModeKind } from '@/types';
import { slideshowBus, slideshowPausedStore, setPaused, togglePaused } from '@/photos/slideshowBus';
import { ReminderOverlay } from '@/reminders/ReminderOverlay';
import { Toasts } from '@/components/Toasts';
import { closeTvApp, getTvMode, openScreensaverSettings, setTvPlaybackActive } from './platform';
import { moveTvFocus, type Direction } from './navigation';
import './tv.css';

type Page = 'home' | 'display' | 'pair' | 'settings';

export function TvApp() {
  const screensaver = getTvMode() === 'screensaver';
  const [page, setPage] = useState<Page>('home');
  const [override, setOverride] = useState<FrameModeKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = useStore(settingsStore);
  const photos = useStore(photosStore);
  const events = useStore(eventsStore);
  const notes = useStore(notesStore);
  const reminders = useStore(remindersStore);
  const schedules = useStore(schedulesStore);
  const hasContent = photos.length + events.length + notes.length + reminders.length + schedules.length > 0;
  const status = useStore(statusStore);
  const paused = useStore(slideshowPausedStore);
  const root = useRef<HTMLDivElement>(null);
  const resolution = useFrameResolution(override);

  useEffect(() => {
    document.body.classList.add('on-tv');
    return () => document.body.classList.remove('on-tv');
  }, []);

  useEffect(() => {
    const playing = !screensaver && page === 'display' && !paused && photos.length > 1 && settings.transition !== 'none'
      && (resolution.baseMode === 'PHOTOS' || resolution.baseMode === 'DASHBOARD');
    setTvPlaybackActive(playing);
    return () => setTvPlaybackActive(false);
  }, [page, screensaver, resolution.baseMode, settings.transition, paused, photos.length]);

  useEffect(() => {
    if (page === 'display') setPaused(false);
  }, [page]);

  useEffect(() => {
    if (screensaver || page === 'display') return;
    root.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [page, screensaver]);

  useLayoutEffect(() => {
    if (screensaver) return;
    const back = () => {
      const dialog = root.current?.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (dialog) { dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click(); return; }
      if (page === 'home') closeTvApp();
      else setPage('home');
    };
    const key = (e: KeyboardEvent) => {
      if (activeRemindersStore.get().length) return;
      if (e.key === 'Escape' || e.key === 'BrowserBack') { e.preventDefault(); back(); return; }
      if (page === 'display') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault(); slideshowBus.emit(e.key === 'ArrowRight' ? 'next' : 'prev');
        } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'MediaPlayPause') {
          e.preventDefault(); togglePaused();
        }
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && root.current) {
        e.preventDefault(); moveTvFocus(root.current, e.key as Direction);
      }
    };
    window.addEventListener('smartframe-back', back);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('smartframe-back', back);
      window.removeEventListener('keydown', key);
    };
  }, [page, screensaver]);

  const demo = async () => {
    setBusy(true); setError(null);
    try { await loadDemoData(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load sample content.'); }
    finally { setBusy(false); }
  };

  if (screensaver) {
    if (!settings.setupComplete || status.storageError) {
      return <div className="tv-saver-message"><h1>Smart Family Frame</h1><p>Open the app to {status.storageError ? 'check your stored content' : 'connect your phone and set up this TV'}.</p></div>;
    }
    return <div className="tv-display tv-screensaver"><FrameContent /></div>;
  }

  return (
    <div className={`tv-app ${page === 'display' ? 'tv-playing' : ''}`} ref={root}>
      {page === 'display' ? <div className="tv-display"><FrameContent override={override} /></div> : (
        <main className="tv-main">
          <header className="tv-header"><div><p className="tv-eyebrow">SMART FAMILY FRAME</p><h1>{page === 'home' ? settings.frameName : page === 'pair' ? 'Connect your phone' : 'Display settings'}</h1></div>{page !== 'home' && <button onClick={() => setPage('home')}>Back</button>}</header>
          {status.storageError && <p role="alert" className="tv-error">Stored content could not be read: {status.storageError}. Open the app again before changing settings.</p>}
          {page === 'home' && <>
            <p className="tv-intro">Your photos, calendar and family updates, together on your TV.</p>
            <div className="tv-actions">
              <button disabled={!!status.storageError} onClick={() => void updateSettings({ setupComplete: true }).then(() => { setOverride(null); setPage('display'); }).catch(() => setError('Could not start the frame.'))}><strong>Start frame</strong><span>Show your photos and family dashboard</span></button>
              <button onClick={() => setPage('pair')}><strong>Connect phone</strong><span>Pair this TV and send family content</span></button>
              <button onClick={() => setPage('settings')}><strong>Display settings</strong><span>Choose a layout and slideshow speed</span></button>
              <button onClick={openScreensaverSettings}><strong>Use as screensaver</strong><span>Select Smart Family Frame in your TV settings</span></button>
            </div>
            <p className="tv-help">Use the arrow buttons and OK to select. Press Back to exit.</p>
            {error && <p role="alert" className="tv-error">{error}</p>}
          </>}
          {page === 'pair' && <><p className="tv-intro">Connect once. The app and screensaver share the same family content.</p><RemoteSharingSection /></>}
          {page === 'settings' && <>
            <h2>Default display</h2>
            <div className="tv-layouts">{FRAME_MODES.map((mode) => <button disabled={!!status.storageError} key={mode} aria-pressed={settings.defaultMode === mode} onClick={() => void updateSettings({ defaultMode: mode, setupComplete: true }).catch(() => setError('Could not save display settings.'))}>{mode.charAt(0) + mode.slice(1).toLowerCase()}</button>)}</div>
            <h2>Slideshow</h2>
            <div className="tv-layouts">{[5, 15, 30, 60].map((seconds) => <button disabled={!!status.storageError} key={seconds} aria-pressed={settings.photoIntervalSec === seconds} onClick={() => void updateSettings({ photoIntervalSec: seconds }).catch(() => setError('Could not save slideshow settings.'))}>{seconds} seconds</button>)}<button disabled={!!status.storageError} aria-pressed={settings.shuffle} onClick={() => void updateSettings({ shuffle: !settings.shuffle }).catch(() => setError('Could not save shuffle.'))}>Shuffle: {settings.shuffle ? 'On' : 'Off'}</button></div>
            <h2>Preview a layout</h2>
            <div className="tv-layouts">{FRAME_MODES.map((mode) => <button key={mode} onClick={() => { setOverride(mode); setPage('display'); }}>{mode.charAt(0) + mode.slice(1).toLowerCase()}</button>)}<button onClick={() => { setOverride(null); setPage('display'); }}>Follow schedule</button></div>
            <p className="tv-help">In the frame: Left/Right changes photos, OK pauses or resumes, Back returns to the menu. Existing schedules take priority over the default display.</p>
            {(!hasContent || busy) && <><p className="tv-help">Try this empty frame with sample photos, calendar events, notes, reminders and a daily display schedule.</p><button disabled={busy || !!status.storageError} onClick={() => void demo()}>{busy ? 'Preparing samples…' : 'Add sample content'}</button></>}
            {error && <p role="alert" className="tv-error">{error}</p>}
          </>}
        </main>
      )}
      <ReminderOverlay /><Toasts />
    </div>
  );
}
