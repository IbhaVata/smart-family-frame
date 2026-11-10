import { useEffect, useRef, useState } from 'react';
import type { FrameModeKind, TransitionStyle, ClockFormat, ClockStyle, NightModeType, SlideshowSource } from '@/types';
import { FRAME_MODES } from '@/types';
import { useStore } from '@/app/store';
import { settingsStore, statusStore, toast, photosStore } from '@/app/stores';
import { updateSettings, buildBackup, applyRestore, resetFrame } from '@/services/dataService';
import { loadDemoData } from '@/services/demoData';
import { enterFrameMode } from '@/frame/FrameMode';
import { display } from '@/services/display/DisplayController';
import { Button, Select, TextInput, Toggle, Segmented, SettingRow, ConfirmDialog, Modal } from '@/components/ui';
import { PHOTO_INTERVAL_PRESETS, isPresetInterval, clampPhotoInterval, describeInterval, MIN_PHOTO_INTERVAL_SEC } from './settings';
import { parseBackupText, backupFilename, type BackupFile } from './backup';
import { formatBytes } from '@/utils/files';
import { RemoteSharingSection } from './RemoteSharingSection';

function FrameNameSetting() {
  const settings = useStore(settingsStore);
  const [name, setName] = useState(settings.frameName);
  useEffect(() => setName(settings.frameName), [settings.frameName]);
  const commit = () => {
    const v = name.trim();
    if (!v || v === settings.frameName) {
      setName(settings.frameName);
      return;
    }
    void updateSettings({ frameName: v.slice(0, 60) }).then(() => toast('Frame name saved.', 'success'));
  };
  return (
    <SettingRow title="Frame name" desc="Shown on the clock and dashboard.">
      <TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} maxLength={60} />
    </SettingRow>
  );
}

function IntervalSetting() {
  const settings = useStore(settingsStore);
  const custom = !isPresetInterval(settings.photoIntervalSec);
  const [mode, setMode] = useState<'preset' | 'custom'>(custom ? 'custom' : 'preset');
  const [customValue, setCustomValue] = useState(String(settings.photoIntervalSec));
  useEffect(() => {
    setCustomValue(String(settings.photoIntervalSec));
    if (!isPresetInterval(settings.photoIntervalSec)) setMode('custom');
  }, [settings.photoIntervalSec]);
  const applyCustom = () => {
    const n = clampPhotoInterval(Number(customValue));
    setCustomValue(String(n));
    if (n !== settings.photoIntervalSec) void updateSettings({ photoIntervalSec: n });
  };
  return (
    <SettingRow title="Photo duration" desc={`Each photo stays for ${describeInterval(settings.photoIntervalSec)}. Changes apply immediately.`}>
      <Select
        value={mode === 'custom' ? 'custom' : String(settings.photoIntervalSec)}
        onChange={(e) => {
          if (e.target.value === 'custom') setMode('custom');
          else {
            setMode('preset');
            void updateSettings({ photoIntervalSec: Number(e.target.value) });
          }
        }}
      >
        {PHOTO_INTERVAL_PRESETS.map((p) => <option key={p.seconds} value={p.seconds}>{p.label}</option>)}
        <option value="custom">Custom…</option>
      </Select>
      {mode === 'custom' && (
        <div className="input-inline">
          <TextInput type="number" min={MIN_PHOTO_INTERVAL_SEC} value={customValue} onChange={(e) => setCustomValue(e.target.value)} onBlur={applyCustom} onKeyDown={(e) => e.key === 'Enter' && applyCustom()} style={{ width: 110 }} aria-label="Custom seconds" />
          <span className="muted small">sec</span>
        </div>
      )}
    </SettingRow>
  );
}

export function SettingsPage() {
  const settings = useStore(settingsStore);
  const status = useStore(statusStore);
  const photoCount = useStore(photosStore).length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<{ backup: BackupFile; warnings: string[] } | null>(null);
  const [restoreErrors, setRestoreErrors] = useState<string[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const caps = display.capabilities();

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => undefined);
  }, [photoCount]);

  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => void updateSettings({ [key]: value });

  const downloadBackup = () => {
    const backup = buildBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename(settings.frameName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Backup downloaded. Note: photo files are not included.', 'success', 6000);
  };

  const pickRestore = async (file: File) => {
    let text = '';
    try {
      text = await file.text();
    } catch {
      setRestoreErrors(['The file could not be read.']);
      return;
    }
    const r = parseBackupText(text);
    if (!r.ok) setRestoreErrors(r.errors);
    else setPendingRestore({ backup: r.backup, warnings: r.warnings });
    if (fileRef.current) fileRef.current.value = '';
  };

  const doRestore = async () => {
    if (!pendingRestore) return;
    setBusy(true);
    try {
      await applyRestore(pendingRestore.backup);
      toast('Backup restored.', 'success');
      setPendingRestore(null);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      await resetFrame();
      window.location.reload();
    } catch {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  const doDemo = async () => {
    setConfirmDemo(false);
    setBusy(true);
    try {
      const r = await loadDemoData();
      toast(`Demo data loaded: ${r.events} events, ${r.notes} notes, ${r.reminders} reminders, ${r.schedules} schedules${r.photos ? `, ${r.photos} sample photos` : ''}.`, 'success', 7000);
    } catch (e) {
      toast(`Demo data failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="sub">Everything is saved on this Mac and works without internet.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="fullscreen" onClick={() => void enterFrameMode()}>Enter fullscreen frame</Button>
        </div>
      </div>

      <div className="card">
        <h2>Frame</h2>
        <FrameNameSetting />
        <SettingRow title="Default frame mode" desc="Shown whenever no schedule is active.">
          <Select value={settings.defaultMode} onChange={(e) => set('defaultMode', e.target.value as FrameModeKind)}>
            {FRAME_MODES.map((m) => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
          </Select>
        </SettingRow>
      </div>

      <div className="card">
        <h2>Photos</h2>
        <IntervalSetting />
        <SettingRow title="Shuffle" desc="Random order instead of the order photos were added.">
          <Toggle checked={settings.shuffle} onChange={(v) => set('shuffle', v)} />
        </SettingRow>
        <SettingRow title="Loop" desc="Start again after the last photo. If off, the slideshow stops on the last photo.">
          <Toggle checked={settings.loop} onChange={(v) => set('loop', v)} />
        </SettingRow>
        <SettingRow title="Slideshow source" desc="Show all photos or only favorites (falls back to all if there are no favorites).">
          <Segmented<SlideshowSource> value={settings.slideshowSource} onChange={(v) => set('slideshowSource', v)} options={[{ value: 'all', label: 'All photos' }, { value: 'favorites', label: 'Favorites' }]} />
        </SettingRow>
        <SettingRow title="Transition" desc="How photos change.">
          <Segmented<TransitionStyle> value={settings.transition} onChange={(v) => set('transition', v)} options={[{ value: 'crossfade', label: 'Crossfade' }, { value: 'fade', label: 'Fade' }, { value: 'none', label: 'None' }]} />
        </SettingRow>
        <SettingRow title="Transition duration" desc={`${settings.transitionMs} ms`}>
          <input type="range" min={100} max={3000} step={100} value={settings.transitionMs} disabled={settings.transition === 'none'} onChange={(e) => set('transitionMs', Number(e.target.value))} style={{ width: 220 }} aria-label="Transition duration" />
        </SettingRow>
        <SettingRow title="Blurred background" desc="Fill the space around portrait photos with a soft blurred copy.">
          <Toggle checked={settings.blurBackground} onChange={(v) => set('blurBackground', v)} />
        </SettingRow>
        <SettingRow title="Clock over photos" desc="Small time and date in the corner during the slideshow.">
          <Toggle checked={settings.showClockOnPhotos} onChange={(v) => set('showClockOnPhotos', v)} />
        </SettingRow>
      </div>

      <div className="card">
        <h2>Clock &amp; date</h2>
        <SettingRow title="Time format">
          <Segmented<ClockFormat> value={settings.clockFormat} onChange={(v) => set('clockFormat', v)} options={[{ value: '12h', label: '12-hour' }, { value: '24h', label: '24-hour' }]} />
        </SettingRow>
        <SettingRow title="Clock style" desc="Digital is bold and large; Minimal is thin and quiet.">
          <Segmented<ClockStyle> value={settings.clockStyle} onChange={(v) => set('clockStyle', v)} options={[{ value: 'digital', label: 'Digital' }, { value: 'minimal', label: 'Minimal' }]} />
        </SettingRow>
        <SettingRow title="Show seconds">
          <Toggle checked={settings.showSeconds} onChange={(v) => set('showSeconds', v)} />
        </SettingRow>
        <SettingRow title="Show date" desc="Weekday and full date under the clock.">
          <Toggle checked={settings.showDate} onChange={(v) => set('showDate', v)} />
        </SettingRow>
      </div>

      <div className="card">
        <h2>Night mode</h2>
        <SettingRow title="Night mode type" desc="Black screen shows nothing; Night clock shows a very dim clock. The monitor itself stays on (a web page cannot power it off).">
          <Segmented<NightModeType> value={settings.nightModeType} onChange={(v) => set('nightModeType', v)} options={[{ value: 'clock', label: 'Night clock' }, { value: 'black', label: 'Black screen' }]} />
        </SettingRow>
      </div>

      <RemoteSharingSection />

      <div className="card">
        <h2>Household</h2>
        <SettingRow title="Household notices on Dashboard" desc="Optionally show a small household notice in frame Dashboard mode. Financial details stay hidden. Off by default.">
          <Toggle checked={settings.showHouseholdOnFrame} onChange={(v) => set('showHouseholdOnFrame', v)} />
        </SettingRow>
      </div>

      <div className="card">
        <h2>Display</h2>
        <SettingRow title="Fullscreen" desc="Enter frame mode on the Acer monitor. Press Esc to exit.">
          <Button icon="fullscreen" onClick={() => void enterFrameMode()}>Enter frame mode</Button>
        </SettingRow>
        <SettingRow title="Keep screen awake" desc={caps.wakeLock ? 'Supported: the screen stays on while the frame runs.' : 'Not supported in this browser. Set your Mac to never sleep the display (see README).'}>
          <span className={`chip ${caps.wakeLock ? 'ok' : 'warn'}`}>{caps.wakeLock ? 'Available' : 'Unavailable'}</span>
        </SettingRow>
        <SettingRow title="Monitor power / brightness" desc="Physical control is not possible from a browser. The display abstraction is ready for the future ARM board.">
          <span className="chip">Not available in V1</span>
        </SettingRow>
      </div>

      <div className="card">
        <h2>Data</h2>
        <SettingRow
          title="Storage"
          desc={
            status.storage === 'indexeddb'
              ? `Local IndexedDB for ${window.location.origin}${usage && usage.quota ? ` · ${formatBytes(usage.usage)} used of ${formatBytes(usage.quota)} available` : ''}. Browser storage belongs to this exact address (port included): always open the frame at the same address.${status.persisted === false ? ' The browser has not yet granted durable storage; it could still clean it up if the disk gets full. Chrome grants it once you install the frame as an app (AUTOSTART.md, option A).' : ''}`
              : 'Memory only: the browser refused local storage, so nothing will survive a reload.'
          }
        >
          <span className={`chip ${status.storage !== 'indexeddb' ? 'danger' : status.persisted === false ? 'warn' : 'ok'}`}>
            {status.storage !== 'indexeddb' ? 'Not persistent' : status.persisted === true ? 'Durable (granted)' : status.persisted === false ? 'Saved (best-effort)' : 'Saved locally'}
          </span>
        </SettingRow>
        <SettingRow title="Demo data" desc="Adds sample events, notes, reminders, schedules and locally generated sample photos (only if you have no photos).">
          <Button onClick={() => setConfirmDemo(true)} disabled={busy}>Load demo data</Button>
        </SettingRow>
        <SettingRow title="Backup" desc="Download a JSON file with settings, calendar, notes, reminders, schedules, household records and the photo list. Photo files themselves are NOT included.">
          <Button icon="download" onClick={downloadBackup}>Download backup</Button>
        </SettingRow>
        <SettingRow title="Restore" desc="Replace settings, calendar, notes, reminders, schedules and household records from a backup file. Photos are not touched.">
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void pickRestore(e.target.files[0])} />
          <Button icon="restore" onClick={() => fileRef.current?.click()}>Choose backup file…</Button>
        </SettingRow>
        <SettingRow title="Reset smart frame" desc="Deletes ALL photos, events, notes, reminders, schedules, household records and settings on this Mac and returns to first-time setup.">
          <Button variant="danger" icon="warning" onClick={() => setConfirmReset(true)}>RESET SMART FRAME</Button>
        </SettingRow>
      </div>

      <p className="small faint">Smart Family Frame V1 · {status.storage === 'indexeddb' ? 'IndexedDB' : 'memory'} · React + Vite · offline PWA</p>

      {confirmDemo && <ConfirmDialog title="Load demo data?" message="Sample events, notes, reminders and schedules will be added. Six locally generated sample photos are added only if your library is empty." confirmLabel="Load demo data" onConfirm={() => void doDemo()} onCancel={() => setConfirmDemo(false)} />}
      {confirmReset && (
        <ConfirmDialog
          title="Reset the smart frame?"
          danger
          busy={busy}
          confirmLabel="Yes, erase everything"
          message={<><p><strong>This permanently deletes every photo ({photoCount}), event, note, reminder, schedule and setting stored by this frame.</strong></p><p>Download a backup first if you want to keep your calendar, notes and schedules.</p></>}
          onConfirm={() => void doReset()}
          onCancel={() => setConfirmReset(false)}
        />
      )}
      {restoreErrors && (
        <Modal title="This backup cannot be used" onClose={() => setRestoreErrors(null)} footer={<Button variant="primary" onClick={() => setRestoreErrors(null)}>OK</Button>}>
          <div className="form-errors">{restoreErrors.map((e) => <span key={e}>{e}</span>)}</div>
          <p className="muted small" style={{ marginTop: 12 }}>Nothing was changed.</p>
        </Modal>
      )}
      {pendingRestore && (
        <ConfirmDialog
          title="Restore this backup?"
          busy={busy}
          confirmLabel="Restore"
          message={
            <>
              <p>From <strong>{pendingRestore.backup.frameName}</strong>, exported {new Date(pendingRestore.backup.exportedAt).toLocaleString()}.</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>{pendingRestore.backup.events.length} events</li>
                <li>{pendingRestore.backup.notes.length} notes</li>
                <li>{pendingRestore.backup.reminders.length} reminders</li>
                <li>{pendingRestore.backup.schedules.length} schedules</li>
                <li>{pendingRestore.backup.householdServices.length} household services</li>
                <li>Settings</li>
              </ul>
              {pendingRestore.warnings.map((w) => <div key={w} className="form-info">{w}</div>)}
              <p className="muted">Your current calendar, notes, reminders, schedules and settings will be replaced. Photos stay as they are.</p>
            </>
          }
          onConfirm={() => void doRestore()}
          onCancel={() => setPendingRestore(null)}
        />
      )}
    </div>
  );
}
