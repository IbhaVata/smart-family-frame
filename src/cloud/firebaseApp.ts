/**
 * Lazy, optional Firebase initialization. The heavy Firebase SDK is only ever `import()`ed when a
 * config is present AND something actually asks for cloud services (e.g. opening Settings → Remote
 * Sharing) — a Frame that never touches V2 features never pays the bundle-size or network cost, and a
 * misconfigured/unreachable Firebase project can never crash Frame Mode. Every function here resolves
 * to null on any failure instead of throwing; callers show "Remote sharing not configured" / "Offline".
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { Functions } from 'firebase/functions';
import { getCloudConfig } from './env';

export interface CloudServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

let servicesPromise: Promise<CloudServices | null> | null = null;

async function init(): Promise<CloudServices | null> {
  const config = getCloudConfig();
  if (!config) return null;
  try {
    const [{ initializeApp, getApps, getApp }, { getAuth, connectAuthEmulator }, { initializeFirestore, connectFirestoreEmulator }, { getStorage, connectStorageEmulator }, { getFunctions, connectFunctionsEmulator }] =
      await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/storage'), import('firebase/functions')]);

    const app = getApps().length ? getApp() : initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
    const auth = getAuth(app);
    // The Frame is often left running on consumer Wi-Fi for days. Let Firestore fall back to HTTP
    // long-polling when WebChannel is filtered or repeatedly drops; local content remains usable either
    // way, while remote listeners (including photoSync) recover instead of remaining stale.
    const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    const storage = getStorage(app);
    const functions = getFunctions(app);

    // photoSync already owns retry/backoff and caps attempts. Firebase Storage's ten-minute default
    // would otherwise leave a Frame waiting far longer than that queue intends when a download is
    // blocked by an intermittent network or a newly-propagated Storage policy.
    storage.maxOperationRetryTime = 15_000;

    if (config.useEmulator) {
      // idempotency: Firebase throws if you call connect*Emulator twice on the same instance. Since
      // `servicesPromise` is a cached singleton this only ever runs once per page load, but guard anyway
      // in case a future caller resets the cache (e.g. tests).
      try {
        connectAuthEmulator(auth, `http://${config.emulatorHost}:9099`, { disableWarnings: true });
        connectFirestoreEmulator(db, config.emulatorHost, 8080);
        connectStorageEmulator(storage, config.emulatorHost, 9199);
        connectFunctionsEmulator(functions, config.emulatorHost, 5001);
      } catch (e) {
        console.warn('[cloud] emulator connection already established or failed', e);
      }
    }
    return { app, auth, db, storage, functions };
  } catch (e) {
    console.error('[cloud] Firebase initialization failed; continuing in local-only mode.', e);
    return null;
  }
}

/** Returns the shared Firebase services, initializing lazily on first call. Never throws. */
export function getCloudServices(): Promise<CloudServices | null> {
  if (!servicesPromise) servicesPromise = init();
  return servicesPromise;
}

/** Test-only: forces re-initialization on the next getCloudServices() call. */
export function resetCloudServicesForTests(): void {
  servicesPromise = null;
}
