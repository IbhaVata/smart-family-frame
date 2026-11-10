import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

const V2_STORES = ['photos', 'photoBlobs', 'thumbnails', 'events', 'notes', 'reminders', 'schedules', 'settings', 'householdServices', 'householdEntries', 'householdPayments', 'householdServiceSettings'] as const;

function createV2Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('smart-family-frame', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of V2_STORES) {
        const store = db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
        if (name === 'photos') store.createIndex('byCreatedAt', 'createdAt');
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['events', 'householdServices', 'settings'], 'readwrite');
      tx.objectStore('events').put({ id: 'event-v2', title: 'Anniversary', date: '2026-09-15', allDay: true, description: '', createdAt: 1, updatedAt: 1 });
      tx.objectStore('householdServices').put({ id: 'service-v2', name: 'Maid', type: 'MAID', vendorName: '', startDate: '2026-01-01', paymentType: 'MONTHLY_FIXED', rate: 5000, status: 'ACTIVE', notes: '', createdAt: 1, updatedAt: 1 });
      tx.objectStore('settings').put({ key: 'app', value: { frameName: 'Existing V2 Frame', setupComplete: true } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('IndexedDB v2 to v3 migration (V2 cloud sync stores)', () => {
  it('adds frameIdentity/syncQueue/cloudPhotoMap/syncCursors without losing any existing V1/V2 records', async () => {
    await createV2Database();
    const { openFrameDB, DB_VERSION } = await import('@/storage/db');
    const db = await openFrameDB();
    expect(DB_VERSION).toBe(3);
    expect(Array.from(db.objectStoreNames)).toEqual(expect.arrayContaining(['frameIdentity', 'syncQueue', 'cloudPhotoMap', 'syncCursors']));
    // Existing V1/V2 data survived untouched.
    expect((await db.get('events', 'event-v2'))?.title).toBe('Anniversary');
    expect((await db.get('householdServices', 'service-v2'))?.name).toBe('Maid');
    expect((await db.get('settings', 'app'))?.value).toMatchObject({ frameName: 'Existing V2 Frame', setupComplete: true });
    // New stores are empty but usable.
    expect(await db.getAll('syncQueue')).toEqual([]);
    await db.put('frameIdentity', { key: 'device', frameId: 'FRAME-TEST01', deviceUid: null, createdAt: 1, familyId: null, familyName: null, pairedAt: null });
    expect((await db.get('frameIdentity', 'device'))?.frameId).toBe('FRAME-TEST01');
  });
});
