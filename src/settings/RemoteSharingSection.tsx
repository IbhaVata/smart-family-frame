import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/app/store';
import { remoteSharingStore, toast } from '@/app/stores';
import { Button, ConfirmDialog } from '@/components/ui';
import { createPairingCode, watchPairingCode, disconnectFrame, type PairingWatchResult } from '@/cloud/pairing';
import { restartSyncEngine } from '@/cloud/syncEngine';

const STATUS_LABEL: Record<string, string> = {
  not_configured: 'Remote sharing not configured',
  not_paired: 'Not connected to a family',
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline (will resume automatically)',
  error: 'Problem connecting',
};
const STATUS_CHIP_CLASS: Record<string, string> = {
  not_configured: '',
  not_paired: '',
  connecting: 'warn',
  connected: 'ok',
  offline: 'warn',
  error: 'danger',
};

/** Shows a pairing code + QR. With `auto`, it generates one immediately and replaces it before it
 *  expires, so an unpaired TV simply always shows a scannable code — no menu to find, no button. */
export function PairingCard({ auto = false }: { auto?: boolean } = {}) {
  const [pending, setPending] = useState<{ code: string; expiresAt: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; unsubRef.current?.(); };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((pending.expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pending]);

  useEffect(() => {
    if (!pending) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    const familyAppUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FAMILY_APP_URL || 'https://your-family-app-url.example';
    const pairUrl = `${familyAppUrl.replace(/\/$/, '')}/pair?code=${pending.code}`;
    void import('qrcode').then((QRCode) =>
      QRCode.toDataURL(pairUrl, { width: 220, margin: 1 }).then((url) => {
        if (!cancelled) setQrDataUrl(url);
      }),
    ).catch(() => setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [pending]);

  const start = async () => {
    setBusy(true);
    setError(null);
    setClaimed(false);
    try {
      const result = await createPairingCode();
      if (!mounted.current) return;
      if (!result) {
        setError('Could not reach the server. Check your internet connection and try again.');
        return;
      }
      setPending(result);
      unsubRef.current?.();
      const unsubscribe = await watchPairingCode(result.code, result.expiresAt, (r: PairingWatchResult) => {
        if (!mounted.current) return;
        if (r.status === 'claimed') {
          setClaimed(true);
          toast(`Connected to ${r.familyName}.`, 'success');
          void restartSyncEngine();
        } else if (r.status === 'expired') {
          setPending(null);
          if (auto) void start();
          else setError('That code expired. Generate a new one.');
        } else {
          setError(r.message);
        }
      });
      if (mounted.current) unsubRef.current = unsubscribe;
      else unsubscribe();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!auto || autoStarted.current) return; // generate once per mount, even under StrictMode
    autoStarted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (claimed) return <p className="form-info">Connected! This Frame is now part of your family.</p>;

  return (
    <div className="stack">
      {!pending && auto && !error && <p className="muted">Preparing your code…</p>}
      {!pending && (!auto || error) && (
        <Button variant="primary" onClick={() => void start()} disabled={busy}>
          {busy ? 'Generating…' : 'Connect family'}
        </Button>
      )}
      {pending && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 4 }}>{pending.code}</div>
          <p className="muted small">
            Scan this QR code with your phone camera — or open the Family app and enter the code.
            Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}.
          </p>
          {qrDataUrl && <img src={qrDataUrl} alt="Pairing QR code" width={180} height={180} style={{ borderRadius: 8, background: '#fff', padding: 8 }} />}
          <Button onClick={() => void start()} disabled={busy}>Generate a new code</Button>
        </div>
      )}
      {error && <div className="form-errors" role="alert"><span>{error}</span></div>}
    </div>
  );
}

export function RemoteSharingSection() {
  const state = useStore(remoteSharingStore);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);

  const doDisconnect = async () => {
    setBusy(true);
    try {
      const result = await disconnectFrame();
      if (result.ok) {
        toast('Cloud disconnected. Photos, calendar, notes, reminders and household records already on this Frame are unchanged.', 'success', 7000);
      } else {
        toast(result.message, 'error');
      }
    } finally {
      setBusy(false);
      setConfirmDisconnect(false);
    }
  };

  return (
    <div className="card">
      <h2>Remote sharing</h2>
      <div className="setting">
        <div className="setting-text">
          <div className="setting-title">Status</div>
          <div className="setting-desc">
            {state.status === 'not_configured' && 'This build has no Firebase project configured. Photos, calendar, notes, reminders and household stay fully local and work normally — see FIREBASE_SETUP.md to enable remote sharing.'}
            {state.status === 'not_paired' && 'Connect this Frame to a family so members can send photos and updates from their phones.'}
            {state.status === 'connecting' && 'Connecting to your family…'}
            {state.status === 'connected' && `Connected to ${state.familyName ?? 'your family'}.`}
            {state.status === 'offline' && 'No internet connection right now. Everything already on this Frame keeps working; sync will resume automatically.'}
            {state.status === 'error' && (state.errorMessage ?? 'Something went wrong connecting to the cloud.')}
          </div>
        </div>
        <div className="setting-control">
          <span className={`chip ${STATUS_CHIP_CLASS[state.status] ?? ''}`}>{STATUS_LABEL[state.status] ?? state.status}</span>
        </div>
      </div>

      {state.status !== 'not_configured' && (
        <>
          <div className="setting">
            <div className="setting-text"><div className="setting-title">Frame ID</div><div className="setting-desc">Shown to family members if they need to identify this Frame.</div></div>
            <div className="setting-control"><code>{state.frameId ?? '—'}</code></div>
          </div>

          {state.status === 'connected' && (
            <>
              <div className="setting">
                <div className="setting-text"><div className="setting-title">Last sync</div></div>
                <div className="setting-control">{state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleTimeString() : '—'}</div>
              </div>
              <div className="setting">
                <div className="setting-text"><div className="setting-title">Pending items</div><div className="setting-desc">Photos or updates still downloading.</div></div>
                <div className="setting-control"><span className={`chip ${state.pendingCount > 0 ? 'warn' : 'ok'}`}>{state.pendingCount}</span></div>
              </div>
              <div className="setting">
                <div className="setting-text"><div className="setting-title">Connected family members</div></div>
                <div className="setting-control">
                  {state.members.length === 0 ? <span className="muted small">None yet</span> : (
                    <ul style={{ margin: 0, paddingLeft: 18, textAlign: 'left' }}>
                      {state.members.filter((m) => m.status === 'ACTIVE').map((m) => (
                        <li key={m.uid}>{m.displayName} {m.role === 'OWNER' && <span className="chip">Owner</span>}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Keep the card mounted through every status: generating a code restarts sync, which passes
              through 'connecting'. Unmounting here used to discard the freshly generated code. */}
          <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
            <div className="setting-title" style={{ marginBottom: 10 }}>
              {state.status === 'connected' ? 'Pair another member' : 'Connect family'}
            </div>
            <PairingCard />
          </div>

          {state.status === 'connected' && (
            <div className="setting">
              <div className="setting-text"><div className="setting-title">Disconnect cloud</div><div className="setting-desc">Stops remote sharing. All photos, calendar, notes, reminders and household records already on this Frame are kept.</div></div>
              <div className="setting-control"><Button variant="danger" onClick={() => setConfirmDisconnect(true)}>Disconnect cloud</Button></div>
            </div>
          )}
        </>
      )}

      {confirmDisconnect && (
        <ConfirmDialog
          title="Disconnect this Frame from the cloud?"
          danger
          busy={busy}
          confirmLabel="Disconnect"
          message="This Frame will stop receiving remote photos and updates. Everything already stored on this Frame stays exactly as it is."
          onConfirm={() => void doDisconnect()}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
    </div>
  );
}
