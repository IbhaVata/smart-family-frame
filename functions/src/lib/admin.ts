import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export const app = getApps().length ? getApps()[0]! : initializeApp();
export const db = getFirestore(app);
export const storage = getStorage(app);
