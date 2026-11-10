import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import { disconnectFrame, updateFrameSettings } from '@/lib/api';
import type { ScreenName } from '@/App';
import type { RemoteSettingsPatch } from '@shared/types';

function FrameSettingsPanel({ frameId }: { frameId: string }) {
  const [remote, setRemote] = useState<RemoteSettingsPatch | null>(null);
  const [interval, setInterval_] = useState(15);
  const [shuffle, setShuffle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(doc(db, 'frames', frameId, 'remoteSettings', 'current'), (snap) => {
      const data = snap.data() as RemoteSettingsPatch | undefined;
      if (data) {
        setRemote(data);
        if (typeof data.photoIntervalSec === 'number') setInterval_(data.photoIntervalSec);
        if (typeof data.shuffle === 'boolean') setShuffle(data.shuffle);
      }
    });
  }, [frameId]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateFrameSettings({ frameId, patch: { photoIntervalSec: interval, shuffle } });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  void remote;
  return (
    <div className="card">
      <h2>Slideshow settings</h2>
      <label className="sub">Photo duration (seconds)</label>
      <input className="input" type="number" min={3} max={600} value={interval} onChange={(e) => setInterval_(Number(e.target.value))} />
      <div className="list-row">
        <span>Shuffle</span>
        <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
      </div>
      <button className="btn btn-primary btn-block" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save to Frame'}</button>
      {saved && <p className="form-info" style={{ marginTop: 8 }}>Sent to the Frame.</p>}
    </div>
  );
}

export function FramesScreen({ push }: { push: (s: ScreenName) => void }) {
  const { frames, isOwner, activeFrameId, setActiveFrameId } = useFamily();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnect = async (frameId: string) => {
    if (!window.confirm('Disconnect this Frame? It stops receiving remote photos and updates; everything already on it stays.')) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectFrame({ frameId });
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\w+\/[\w-]+:\s*/, '') : 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="card">
        {frames.map((f) => (
          <div className="list-row" key={f.frameId}>
            <div>
              <div className="title">{f.name}</div>
              <span className={`chip ${f.status === 'ONLINE' ? 'ok' : ''}`}>{f.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {activeFrameId === f.frameId ? <span className="chip ok">Selected</span> : <button className="btn btn-sm" onClick={() => setActiveFrameId(f.frameId)}>Select</button>}
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-block" onClick={() => push('pairFrame')}>+ Pair another Frame</button>

      {isOwner && activeFrameId && <FrameSettingsPanel frameId={activeFrameId} />}

      {isOwner && activeFrameId && (
        <div className="card">
          <h2>Danger zone</h2>
          <button className="btn btn-danger btn-block" disabled={busy} onClick={() => void disconnect(activeFrameId)}>Disconnect this Frame</button>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}
    </div>
  );
}
