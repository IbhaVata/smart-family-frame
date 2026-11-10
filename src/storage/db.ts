import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PhotoMeta, CalendarEvent, Note, Reminder, Schedule, HouseholdService, HouseholdDailyEntry, HouseholdPayment, HouseholdServiceSettings } from '@/types';
import type { FrameIdentity, SyncQueueItem, CloudPhotoMap, SyncCursor } from '../../shared/types';
import { StorageError, toStorageError } from './errors';

export const DB_NAME = 'smart-family-frame';
export const DB_VERSION = 3;

export interface FrameDB extends DBSchema {
  photos: { key: string; value: PhotoMeta; indexes: { byCreatedAt: number } };
  photoBlobs: { key: string; value: { id: string; blob: Blob } };
  thumbnails: { key: string; value: { id: string; blob: Blob } };
  events: { key: string; value: CalendarEvent };
  notes: { key: string; value: Note };
  reminders: { key: string; value: Reminder };
  schedules: { key: string; value: Schedule };
  settings: { key: string; value: { key: string; value: unknown } };
  householdServices: { key: string; value: HouseholdService };
  householdEntries: { key: string; value: HouseholdDailyEntry };
  householdPayments: { key: string; value: HouseholdPayment };
  householdServiceSettings: { key: string; value: HouseholdServiceSettings };
  // V2 — cloud sync bookkeeping. All additive (existing stores/data are untouched by this upgrade).
  frameIdentity: { key: string; value: FrameIdentity };
  syncQueue: { key: string; value: SyncQueueItem; indexes: { byCreatedAt: number } };
  cloudPhotoMap: { key: string; value: CloudPhotoMap; indexes: { byLocalPhotoId: string } };
  syncCursors: { key: string; value: SyncCursor };
}

export type StoreName =
  | 'photos' | 'photoBlobs' | 'thumbnails' | 'events' | 'notes' | 'reminders' | 'schedules' | 'settings'
  | 'householdServices' | 'householdEntries' | 'householdPayments' | 'householdServiceSettings'
  | 'frameIdentity' | 'syncQueue' | 'cloudPhotoMap' | 'syncCursors';
export const ALL_STORES: StoreName[] = [
  'photos', 'photoBlobs', 'thumbnails', 'events', 'notes', 'reminders', 'schedules', 'settings',
  'householdServices', 'householdEntries', 'householdPayments', 'householdServiceSettings',
  'frameIdentity', 'syncQueue', 'cloudPhotoMap', 'syncCursors',
];

let dbPromise: Promise<IDBPDatabase<FrameDB>> | null = null;

function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openFrameDB(): Promise<IDBPDatabase<FrameDB>> {
  if (dbPromise) return dbPromise;
  if (!hasIndexedDB()) {
    return Promise.reject(new StorageError('unavailable', 'IndexedDB is not available in this browser.'));
  }
  dbPromise = openDB<FrameDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('byCreatedAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('photoBlobs')) db.createObjectStore('photoBlobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('thumbnails')) db.createObjectStore('thumbnails', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reminders')) db.createObjectStore('reminders', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('schedules')) db.createObjectStore('schedules', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('householdServices')) db.createObjectStore('householdServices', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('householdEntries')) db.createObjectStore('householdEntries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('householdPayments')) db.createObjectStore('householdPayments', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('householdServiceSettings')) db.createObjectStore('householdServiceSettings', { keyPath: 'id' });
      // V2 stores (DB_VERSION 3). Same idempotent-additive pattern as above.
      if (!db.objectStoreNames.contains('frameIdentity')) db.createObjectStore('frameIdentity', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncQueue = db.createObjectStore('syncQueue', { keyPath: 'id' });
        syncQueue.createIndex('byCreatedAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('cloudPhotoMap')) {
        const cloudPhotoMap = db.createObjectStore('cloudPhotoMap', { keyPath: 'cloudPhotoId' });
        cloudPhotoMap.createIndex('byLocalPhotoId', 'localPhotoId');
      }
      if (!db.objectStoreNames.contains('syncCursors')) db.createObjectStore('syncCursors', { keyPath: 'domain' });
    },
    blocked() {
      console.warn('[storage] database upgrade blocked by another open tab');
    },
    blocking(_currentVersion, blockedVersion) {
      // Another tab/window wants to open a versionchange transaction: either an upgrade (blockedVersion
      // is that version number) or a full DELETE, i.e. RESET SMART FRAME (blockedVersion is null - a
      // delete is requested at version null, same as an upgrade request). Close so it can proceed.
      dbPromise?.then((db) => db.close()).catch(() => undefined);
      dbPromise = null;
      if (blockedVersion === null) {
        // This window's data is about to be gone from disk because ANOTHER window reset the frame.
        // Simply closing and letting the next storage call reopen (the upgrade case's behaviour) would
        // silently recreate an empty database and write this window's still-live in-memory content
        // straight back into it - undoing the other window's reset without either window noticing.
        // Reload this window too, so it returns to Setup exactly like the window that reset did.
        window.location.reload();
      }
    },
    terminated() {
      dbPromise = null;
    },
  }).catch((e) => {
    dbPromise = null;
    throw toStorageError(e, 'Opening the local database');
  });
  return dbPromise;
}

/** Deletes the whole database (used by RESET). Closes the connection first. */
export async function deleteFrameDB(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
    dbPromise = null;
  }
  if (!hasIndexedDB()) return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(toStorageError(req.error, 'Resetting the local database'));
    req.onblocked = () => resolve(); // will complete once other tabs close
  });
}
