import { useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth, firebaseConfigured } from '@/firebase';

const EMAIL_STORAGE_KEY = 'sff.pendingSignInEmail';

function isMobile(): boolean {
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

function signInErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'auth/network-request-failed') return 'Could not reach the sign-in service. Check your internet connection and try again.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Allow pop-ups for this app, or open it in Safari or Chrome.';
  if (code === 'auth/popup-closed-by-user') return 'Sign-in was cancelled. Try again when you are ready.';
  if (code === 'auth/unauthorized-domain') return 'This app address is not approved for sign-in. Please open the official Smart Family link again.';
  if (code === 'auth/operation-not-allowed') return 'This sign-in method is not available right now. Please try the other option.';
  return error instanceof Error ? error.message.replace(/^Firebase:\s*/, '') : fallback;
}

export function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  useEffect(() => {
    if (!auth) return;
    // Returning from a Google sign-in redirect (used on mobile where popups are unreliable).
    void getRedirectResult(auth).catch((e) => setError(signInErrorMessage(e, 'Sign-in failed.')));

    if (isSignInWithEmailLink(auth, window.location.href)) {
      const stored = window.localStorage.getItem(EMAIL_STORAGE_KEY);
      if (stored) {
        setBusy(true);
        signInWithEmailLink(auth, stored, window.location.href)
          .then(() => window.localStorage.removeItem(EMAIL_STORAGE_KEY))
          .catch((e) => setError(signInErrorMessage(e, 'Sign-in link failed. Ask for a new one.')))
          .finally(() => setBusy(false));
      } else {
        setNeedsEmailConfirm(true); // opened on a different device than the one the link was requested on
      }
    }
  }, []);

  if (!firebaseConfigured || !auth) {
    return (
      <div className="signin-screen">
        <h1>Smart Family</h1>
        <p className="muted">This app is not yet configured to connect to a family. Ask whoever set up your Smart Frame to finish the Firebase setup (see FIREBASE_SETUP.md), then reload.</p>
      </div>
    );
  }

  // `auth` is narrowed to non-null above, but that narrowing does not persist into these closures
  // (each is its own function scope) — capture a locally-typed non-null reference instead.
  const authInstance = auth;

  const signInGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      if (isMobile()) await signInWithRedirect(authInstance, provider);
      else await signInWithPopup(authInstance, provider);
    } catch (e) {
      setError(signInErrorMessage(e, 'Google sign-in failed.'));
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendSignInLinkToEmail(authInstance, email.trim(), { url: window.location.origin, handleCodeInApp: true });
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email.trim());
      setLinkSent(true);
    } catch (e) {
      setError(signInErrorMessage(e, 'Could not send the sign-in link.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmEmailAndFinish = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailLink(authInstance, email.trim(), window.location.href);
    } catch (e) {
      setError(signInErrorMessage(e, 'That did not match the link. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (needsEmailConfirm) {
    return (
      <div className="signin-screen">
        <h1>Confirm your email</h1>
        <p className="muted">Enter the email address you used to request this sign-in link.</p>
        <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary" disabled={busy} onClick={() => void confirmEmailAndFinish()}>{busy ? 'Signing in…' : 'Continue'}</button>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  return (
    <div className="signin-screen">
      <h1>Smart Family</h1>
      <p className="muted">Sign in to send photos and manage your family's Smart Frame.</p>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void signInGoogle()}>Continue with Google</button>
      <div className="signin-divider">or</div>
      {linkSent ? (
        <p className="form-info">Check {email} for a sign-in link.</p>
      ) : (
        <>
          <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-block" disabled={busy} onClick={() => void sendLink()}>Email me a sign-in link</button>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
