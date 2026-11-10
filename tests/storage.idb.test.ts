import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import type { CalendarEvent, Note, Reminder, Schedule, PhotoMeta } from '@/types';
import { toStorageError } from '@/storage/errors';

const backendMod = await import('@/storage/backend');
const repos = await import('@/storage/repositories');
const db = await import('@/storage/db');

const ev = (id: string, title = 'T'): CalendarEvent => ({ id, title, date: '2026-09-15', allDay: true, description: '', createdAt: 1, updatedAt: 1 });
const note = (id: string): Note => ({ id, title: 'n', message: 'm', pinned: true, createdAt: 1, updatedAt: 1 });
const rem = (id: string): Reminder => ({ id, title: 'r', message: '', date: '2026-09-15', time: '07:00', repeat: 'DAILY', enabled: true, lastTriggeredAt: null, createdAt: 1, updatedAt: 1 });
const sch = (id: string): Schedule => ({ id, name: 's', startTime: '08:00', endTime: '18:00', daysOfWeek: [1], mode: 'PHOTOS', enabled: true, priority: 1 });
const photo = (id: string): PhotoMeta => ({ id, filename: `${id}.jpg`, mimeType: 'image/jpeg', createdAt: 1, favorite: false, size: 3 });

describe('IndexedDB backend (fake-indexeddb)', () => {
  beforeAll(async () => {
    const r = await backendMod.initBackend();
    expect(r.backend.kind).toBe('indexeddb');
    expect(r.error).toBeUndefined();
  });

  it('CRUD for events, notes, reminders, schedules', async () => {
    await repos.eventRepo.put(ev('e1'));
    await repos.eventRepo.put(ev('e2'));
    expect((await repos.eventRepo.list()).map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    await repos.eventRepo.put(ev('e1', 'Updated'));
    expect((await repos.eventRepo.get('e1'))?.title).toBe('Updated');
    await repos.eventRepo.remove('e1');
    expect(await repos.eventRepo.get('e1')).toBeUndefined();
    expect((await repos.eventRepo.list()).length).toBe(1);

    await repos.noteRepo.putMany([note('n1'), note('n2'), note('n3')]);
    expect((await repos.noteRepo.list()).length).toBe(3);
    await repos.noteRepo.clear();
    expect((await repos.noteRepo.list()).length).toBe(0);

    await repos.reminderRepo.put(rem('r1'));
    await repos.reminderRepo.put({ ...rem('r1'), lastTriggeredAt: 12345 });
    expect((await repos.reminderRepo.get('r1'))?.lastTriggeredAt).toBe(12345);

    await repos.scheduleRepo.put(sch('s1'));
    await repos.scheduleRepo.remove('s1');
    expect((await repos.scheduleRepo.list()).length).toBe(0);
  });

  it('settings load defaults, save, and normalise garbage', async () => {
    const def = await repos.settingsRepo.load();
    expect(def.frameName).toBe('Living Room Frame');
    await repos.settingsRepo.save({ ...def, frameName: 'Kitchen', clockFormat: '24h' });
    const again = await repos.settingsRepo.load();
    expect(again.frameName).toBe('Kitchen');
    expect(again.clockFormat).toBe('24h');
    await backendMod.getBackend().put('settings', { key: 'app', value: { clockFormat: 'bogus', photoIntervalSec: 'x' } });
    const fixed = await repos.settingsRepo.load();
    expect(fixed.clockFormat).toBe('12h');
    expect(fixed.photoIntervalSec).toBe(15);
  });

  it('photos: metadata + blob + thumbnail are written together and removed together', async () => {
    const blob = new Blob(['jpg'], { type: 'image/jpeg' });
    const thumb = new Blob(['t'], { type: 'image/jpeg' });
    await repos.photoRepo.add(photo('p1'), blob, thumb);
    await repos.photoRepo.add(photo('p2'), blob, null);
    expect((await repos.photoRepo.list()).length).toBe(2);
    expect(await (await repos.photoRepo.getBlob('p1'))!.text()).toBe('jpg');
    expect(await (await repos.photoRepo.getThumbnail('p1'))!.text()).toBe('t');
    expect(await repos.photoRepo.getThumbnail('p2')).toBeNull();
    await repos.photoRepo.updateMeta({ ...photo('p1'), favorite: true });
    expect((await repos.photoRepo.get('p1'))?.favorite).toBe(true);
    await repos.photoRepo.remove('p1');
    expect(await repos.photoRepo.get('p1')).toBeUndefined();
    expect(await repos.photoRepo.getBlob('p1')).toBeNull();
    expect(await repos.photoRepo.getThumbnail('p1')).toBeNull();
    expect(await repos.photoRepo.getBlob('p2')).not.toBeNull();
  });

  it('restoreContent replaces configuration atomically and leaves photos alone', async () => {
    await repos.eventRepo.put(ev('old'));
    await repos.restoreContent({
      settings: { ...(await repos.settingsRepo.load()), frameName: 'Restored' },
      events: [ev('new1'), ev('new2')],
      notes: [note('nn')],
      reminders: [],
      schedules: [sch('ss')],
    });
    expect((await repos.eventRepo.list()).map((e) => e.id).sort()).toEqual(['new1', 'new2']);
    expect((await repos.noteRepo.list()).length).toBe(1);
    expect((await repos.reminderRepo.list()).length).toBe(0);
    expect((await repos.settingsRepo.load()).frameName).toBe('Restored');
    expect((await repos.photoRepo.list()).length).toBe(1); // p2 untouched
  });

  it('a failing write inside replaceStores rolls the whole restore back', async () => {
    const before = (await repos.eventRepo.list()).map((e) => e.id).sort();
    await expect(
      backendMod.getBackend().replaceStores({ events: [ev('x'), { id: 'x' } as unknown as CalendarEvent, { bad: true } as unknown as CalendarEvent] }),
    ).rejects.toBeTruthy();
    expect((await repos.eventRepo.list()).map((e) => e.id).sort()).toEqual(before);
  });

  it('reset deletes the database; reopening yields an empty, working store', async () => {
    await db.deleteFrameDB();
    expect((await repos.eventRepo.list()).length).toBe(0);
    expect((await repos.photoRepo.list()).length).toBe(0);
    expect((await repos.settingsRepo.load()).setupComplete).toBe(false);
    await repos.eventRepo.put(ev('after-reset'));
    expect((await repos.eventRepo.list()).length).toBe(1);
  });

  it('maps browser errors to friendly StorageErrors', () => {
    const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    expect(toStorageError(quota).kind).toBe('quota');
    expect(toStorageError(quota).message).toMatch(/out of storage space/);
    expect(toStorageError(new Error('database is closing')).kind).toBe('unavailable');
    expect(toStorageError(new Error('boom'), 'Saving').message).toMatch(/Saving failed: boom/);
  });
});
