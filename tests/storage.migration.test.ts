import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

const OLD_STORES = ['photos', 'photoBlobs', 'thumbnails', 'events', 'notes', 'reminders', 'schedules', 'settings'] as const;

function createV1Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('smart-family-frame', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of OLD_STORES) {
        const store = db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
        if (name === 'photos') store.createIndex('byCreatedAt', 'createdAt');
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['photos', 'photoBlobs', 'events', 'notes', 'reminders', 'schedules', 'settings'], 'readwrite');
      tx.objectStore('photos').put({ id: 'photo-v1', filename: 'family.jpg', mimeType: 'image/jpeg', createdAt: 1, favorite: true, size: 3 });
      tx.objectStore('photoBlobs').put({ id: 'photo-v1', blob: new Blob(['old-photo']) });
      tx.objectStore('events').put({ id: 'event-v1', title: 'Birthday', date: '2026-09-15', allDay: true, description: '', createdAt: 1, updatedAt: 1 });
      tx.objectStore('notes').put({ id: 'note-v1', title: 'Old note', message: 'Keep me', pinned: true, createdAt: 1, updatedAt: 1 });
      tx.objectStore('reminders').put({ id: 'reminder-v1', title: 'Old reminder', message: '', date: '2026-09-15', time: '09:00', repeat: 'NONE', enabled: true, lastTriggeredAt: null, createdAt: 1, updatedAt: 1 });
      tx.objectStore('schedules').put({ id: 'schedule-v1', name: 'Old schedule', startTime: '08:00', endTime: '18:00', daysOfWeek: [1], mode: 'PHOTOS', enabled: true, priority: 1 });
      tx.objectStore('settings').put({ key: 'app', value: { frameName: 'Existing Frame', setupComplete: true } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('IndexedDB v1 to v2 migration', () => {
  it('adds household stores without losing any existing V1 records or photo blobs', async () => {
    await createV1Database();
    const { openFrameDB, DB_VERSION } = await import('@/storage/db');
    const db = await openFrameDB();
    expect(DB_VERSION).toBe(3);
    expect(Array.from(db.objectStoreNames)).toEqual(expect.arrayContaining(['householdServices', 'householdEntries', 'householdPayments', 'householdServiceSettings']));
    expect((await db.get('photos', 'photo-v1'))?.filename).toBe('family.jpg');
    expect(await (await db.get('photoBlobs', 'photo-v1'))!.blob.text()).toBe('old-photo');
    expect((await db.get('events', 'event-v1'))?.title).toBe('Birthday');
    expect((await db.get('notes', 'note-v1'))?.message).toBe('Keep me');
    expect((await db.get('reminders', 'reminder-v1'))?.title).toBe('Old reminder');
    expect((await db.get('schedules', 'schedule-v1'))?.name).toBe('Old schedule');
    expect((await db.get('settings', 'app'))?.value).toMatchObject({ frameName: 'Existing Frame', setupComplete: true });
  });
});
