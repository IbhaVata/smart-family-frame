import { useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { claimPairingCode } from '@/lib/api';

export function PairFrameScreen({ onDone, initialCode }: { onDone: () => void; initialCode?: string | null }) {
  const { user } = useAuth();
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ frameName: string; familyName: string } | null>(null);

  const submit = async () => {
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) {
      setError('Enter the 6-digit code shown on the Frame.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await claimPairingCode({ code: clean, displayName: user?.displayName ?? undefined });
      setResult({ frameName: res.frameName, familyName: res.familyName });
      window.history.replaceState({}, '', '/');
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\w+\/[\w-]+:\s*/, '') : 'Could not connect. Check the code and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="app-shell">
        <main className="app-main" style={{ paddingTop: 40 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <h2 style={{ textTransform: 'none', color: 'var(--ink)', fontSize: 20 }}>Connected!</h2>
            <p>
              You're now part of <strong>{result.familyName}</strong> and can send photos to <strong>{result.frameName}</strong>.
            </p>
            <button className="btn btn-primary btn-block" onClick={onDone}>
              Continue
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main" style={{ paddingTop: 40 }}>
        <div className="card">
          <h2 style={{ textTransform: 'none', color: 'var(--ink)', fontSize: 20 }}>Connect a Frame</h2>
          <p className="muted">Enter the 6-digit code shown on the TV, or scan the TV's QR code with your phone camera.</p>
          <input
            className="input"
            inputMode="numeric"
            maxLength={6}
            placeholder="482913"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ textAlign: 'center', fontSize: 28, letterSpacing: 6 }}
          />
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </div>
      </main>
    </div>
  );
}
