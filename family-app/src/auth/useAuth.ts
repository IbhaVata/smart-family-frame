import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/firebase';

export interface AuthState {
  loading: boolean;
  user: User | null;
  familyId: string | null;
}

/** Tracks Firebase Auth state and the signed-in user's `users/{uid}.familyId` pointer, set while
 *  claiming a Frame pairing code (see functions/src/pairing.ts). */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, familyId: null });

  useEffect(() => {
    if (!auth) {
      setState({ loading: false, user: null, familyId: null });
      return;
    }
    // On some mobile networks Firebase's initial auth refresh can stall indefinitely. Never leave a
    // family member on a blank/loading screen: after a short grace period show the sign-in screen,
    // while keeping the listener alive so a delayed result still takes effect.
    const startupTimeout = setTimeout(() => {
      setState((s) => (s.loading ? { ...s, loading: false } : s));
    }, 6_000);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      clearTimeout(startupTimeout);
      setState((s) => ({ ...s, loading: false, user, familyId: user ? s.familyId : null }));
    });
    return () => {
      clearTimeout(startupTimeout);
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (!db || !state.user) return;
    const unsub = onSnapshot(doc(db, 'users', state.user.uid), (snap) => {
      const familyId = (snap.data() as { familyId?: string } | undefined)?.familyId ?? null;
      setState((s) => ({ ...s, familyId }));
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.user?.uid]);

  return state;
}
