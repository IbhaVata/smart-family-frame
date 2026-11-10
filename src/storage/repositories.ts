import type { PhotoMeta, CalendarEvent, Note, Reminder, Schedule, Settings, HouseholdService, HouseholdDailyEntry, HouseholdPayment, HouseholdServiceSettings } from '@/types';
import type { FrameIdentity, SyncQueueItem, CloudPhotoMap, SyncCursor, SyncDomain } from '../../shared/types';
import { getBackend } from './backend';
import type { StoreName } from './db';
import { normalizeSettings } from '@/settings/settings';

function makeRepo<T extends { id: string }>(store: StoreName) {
  return {
    list: () => getBackend().getAll<T>(store),
    get: (id: string) => getBackend().get<T>(store, id),
    put: (item: T) => getBackend().put(store, item),
    putMany: (items: T[]) => getBackend().putMany(items.map((value) => ({ store, value }))),
    remove: (id: string) => getBackend().delete(store, id),
    clear: () => getBackend().clear([store]),
  };
}

export const eventRepo = makeRepo<CalendarEvent>('events');
export const noteRepo = makeRepo<Note>('notes');
export const reminderRepo = makeRepo<Reminder>('reminders');
export const scheduleRepo = makeRepo<Schedule>('schedules');
export const householdServiceRepo = makeRepo<HouseholdService>('householdServices');
export const householdEntryRepo = makeRepo<HouseholdDailyEntry>('householdEntries');
export const householdPaymentRepo = makeRepo<HouseholdPayment>('householdPayments');
export const householdServiceSettingsRepo = makeRepo<HouseholdServiceSettings>('householdServiceSettings');

const SETTINGS_KEY = 'app';

export const settingsRepo = {
  async load(): Promise<Settings> {
    const row = await getBackend().get<{ key: string; value: unknown }>('settings', SETTINGS_KEY);
    return normalizeSettings(row?.value);
  },
  async save(settings: Settings): Promise<void> {
    await getBackend().put('settings', { key: SETTINGS_KEY, value: settings });
  },
};

export const photoRepo = {
  list: () => getBackend().getAll<PhotoMeta>('photos'),
  get: (id: string) => getBackend().get<PhotoMeta>('photos', id),
  updateMeta: (meta: PhotoMeta) => getBackend().put('photos', meta),
  /** Writes metadata, full-size blob and thumbnail together. */
  add: (meta: PhotoMeta, blob: Blob, thumb: Blob | null) =>
    getBackend().putMany([
      { store: 'photos', value: meta },
      { store: 'photoBlobs', value: { id: meta.id, blob } },
      ...(thumb ? [{ store: 'thumbnails' as StoreName, value: { id: meta.id, blob: thumb } }] : []),
    ]),
  remove: (id: string) =>
    getBackend().deleteMany([
      { store: 'photos', key: id },
      { store: 'photoBlobs', key: id },
      { store: 'thumbnails', key: id },
    ]),
  async getBlob(id: string): Promise<Blob | null> {
    const row = await getBackend().get<{ id: string; blob: Blob }>('photoBlobs', id);
    return row?.blob ?? null;
  },
  async getThumbnail(id: string): Promise<Blob | null> {
    const row = await getBackend().get<{ id: string; blob: Blob }>('thumbnails', id);
    return row?.blob ?? null;
  },
  clear: () => getBackend().clear(['photos', 'photoBlobs', 'thumbnails']),
};

/* ---- V2 cloud sync bookkeeping ---- */

const FRAME_IDENTITY_KEY = 'device';

export const frameIdentityRepo = {
  async load(): Promise<FrameIdentity | undefined> {
    return getBackend().get<FrameIdentity>('frameIdentity', FRAME_IDENTITY_KEY);
  },
  async save(identity: FrameIdentity): Promise<void> {
    await getBackend().put('frameIdentity', identity);
  },
};

export const syncQueueRepo = makeRepo<SyncQueueItem>('syncQueue');

export const cloudPhotoMapRepo = {
  list: () => getBackend().getAll<CloudPhotoMap>('cloudPhotoMap'),
  get: (cloudPhotoId: string) => getBackend().get<CloudPhotoMap>('cloudPhotoMap', cloudPhotoId),
  put: (map: CloudPhotoMap) => getBackend().put('cloudPhotoMap', map),
  remove: (cloudPhotoId: string) => getBackend().delete('cloudPhotoMap', cloudPhotoId),
};

export const syncCursorRepo = {
  async get(domain: SyncDomain): Promise<SyncCursor | undefined> {
    return getBackend().get<SyncCursor>('syncCursors', domain);
  },
  async set(domain: SyncDomain, lastSyncedAt: number): Promise<void> {
    await getBackend().put('syncCursors', { domain, lastSyncedAt });
  },
};

export interface RestorePayload {
  settings: Settings;
  events: CalendarEvent[];
  notes: Note[];
  reminders: Reminder[];
  schedules: Schedule[];
  householdServices?: HouseholdService[];
  householdEntries?: HouseholdDailyEntry[];
  householdPayments?: HouseholdPayment[];
  householdServiceSettings?: HouseholdServiceSettings[];
}

/** Replaces configuration/content atomically. Photos are untouched. */
export async function restoreContent(payload: RestorePayload): Promise<void> {
  await getBackend().replaceStores({
    settings: [{ key: SETTINGS_KEY, value: payload.settings }],
    events: payload.events,
    notes: payload.notes,
    reminders: payload.reminders,
    schedules: payload.schedules,
    householdServices: payload.householdServices ?? [],
    householdEntries: payload.householdEntries ?? [],
    householdPayments: payload.householdPayments ?? [],
    householdServiceSettings: payload.householdServiceSettings ?? [],
  });
}
