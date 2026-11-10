import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

export const app = getApps().length ? getApps()[0]! : initializeApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export function now(): number {
  return Date.now();
}
