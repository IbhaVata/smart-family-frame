import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { claimFamilyInvite } from '@/lib/api';

/** Opened from an invite link. Joins automatically: the relative only had to sign in. */
export function JoinFamilyScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const { user } = useAuth();
  const [state, setState] = useState<{ status: 'joining' } | { status: 'joined'; familyName: string } | { status: 'error'; message: string }>({ status: 'joining' });
  const started = useRef(false);

  const join = () => {
    setState({ status: 'joining' });
    claimFamilyInvite({ token, displayName: user?.displayName ?? undefined })
      .then((res) => {
        window.history.replaceState({}, '', '/');
        setState({ status: 'joined', familyName: res.familyName });
      })
      .catch((e: unknown) => setState({ status: 'error', message: e instanceof Error ? e.message.replace(/^\w+\/[\w-]+:\s*/, '') : 'Could not join. Try again.' }));
  };

  useEffect(() => {
    if (started.current) return; // StrictMode / remount safety: claim once
    started.current = true;
    join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = () => {
    window.history.replaceState({}, '', '/');
    onDone();
  };

  return (
    <div className="app-shell">
      <main className="app-main" style={{ paddingTop: 40 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          {state.status === 'joining' && <p>Joining your family…</p>}
          {state.status === 'joined' && (
            <>
              <h2 style={{ textTransform: 'none', color: 'var(--ink)', fontSize: 20 }}>Welcome!</h2>
              <p>You're now part of <strong>{state.familyName}</strong>. You can send photos to the family TV.</p>
              <button className="btn btn-primary btn-block" onClick={onDone}>Continue</button>
            </>
          )}
          {state.status === 'error' && (
            <>
              <p className="error-text">{state.message}</p>
              <button className="btn btn-primary btn-block" onClick={join}>Try again</button>
              <button className="btn btn-block" onClick={leave}>Not now</button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
