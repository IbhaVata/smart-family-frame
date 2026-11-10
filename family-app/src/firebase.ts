/**
 * Firebase client init for the Family PWA. Unlike the Frame (src/cloud/firebaseApp.ts), this app is
 * inherently cloud-dependent — there is no "local-only" mode for a companion phone app — so this is a
 * straightforward eager singleton rather than the Frame's lazy/optional one.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const env = import.meta.env;

export const firebaseConfigured = Boolean(
  env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_STORAGE_BUCKET && env.VITE_FIREBASE_MESSAGING_SENDER_ID && env.VITE_FIREBASE_APP_ID,
);

const app = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp({
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      })
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export const functions = app ? getFunctions(app) : null;

if (app && env.VITE_FIREBASE_USE_EMULATOR === 'true') {
  const host = env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';
  connectAuthEmulator(auth!, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db!, host, 8080);
  connectStorageEmulator(storage!, host, 9199);
  connectFunctionsEmulator(functions!, host, 5001);
}
