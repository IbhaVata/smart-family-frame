import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/firebase';

export interface AuthState {
  loading: boolean;
  user: User | null;
  /** `undefined` until the first `users/{uid}` snapshot arrives, so an already-paired user is never
   *  shown the pairing screen while their family pointer is still loading. */
  familyId: string | null | undefined;
}

const AuthContext = createContext<AuthState | null>(null);

/** Tracks Firebase Auth state and the signed-in user's `users/{uid}.familyId` pointer (set while
 *  claiming a Frame pairing code — see functions/src/pairing.ts). Mounted once at the root so every
 *  screen shares one auth listener and one user-doc listener. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, familyId: undefined });

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
      setState((s) => ({ loading: false, user, familyId: user && user.uid === s.user?.uid ? s.familyId : undefined }));
    });
    return () => {
      clearTimeout(startupTimeout);
      unsubAuth();
    };
  }, []);

  const uid = state.user?.uid;
  useEffect(() => {
    if (!db || !uid) return;
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const familyId = (snap.data() as { familyId?: string } | undefined)?.familyId ?? null;
        setState((s) => ({ ...s, familyId }));
      },
      (e) => {
        console.error('[auth] user doc listener failed', e);
        setState((s) => (s.familyId === undefined ? { ...s, familyId: null } : s));
      },
    );
  }, [uid]);

  return createElement(AuthContext.Provider, { value: state }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
