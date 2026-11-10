// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initBackend, getBackend, ALL_STORES } from '../src/storage/backend';
import { cloudPhotoMapRepo, photoRepo, syncQueueRepo } from '../src/storage/repositories';
import { photosStore } from '../src/app/stores';
import { startPhotoSync } from '../src/cloud/photoSync';
import type { CloudPhoto } from '../shared/types';

const mocks = vi.hoisted(() => ({ snapshot: undefined as undefined | ((snapshot: unknown) => void), unsubscribe: vi.fn(), getBytes: vi.fn() }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), query: vi.fn(), where: vi.fn(), onSnapshot: (_q: unknown, _options: unknown, callback: (s: unknown) => void) => { mocks.snapshot = callback; return mocks.unsubscribe; } }));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), getBytes: mocks.getBytes }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: () => vi.fn(async () => ({ data: {} })) }));
vi.mock('firebase/app', () => ({ getApp: vi.fn() }));
vi.mock('../src/services/imageProcessing', () => ({ decodeImage: vi.fn(async () => ({ width: 2, height: 2, thumbnail: new Blob(['thumb']) })) }));

const source = (id: string): CloudPhoto => ({ photoId: id, familyId: 'family', frameId: 'frame', authorizedDeviceUid: 'device', albumId: null,
  storagePath: `families/family/photos/frame/${id}.jpg`, filename: `${id}.jpg`, mimeType: 'image/jpeg', size: 3,
  uploadedBy: 'owner', uploadedByName: 'Family', uploadedAt: 1, source: 'pwa', syncStatus: 'pending' });
function emit(ids: string[], cache = false) { mocks.snapshot?.({ docs: ids.map((id) => ({ id, data: () => source(id) })), metadata: { fromCache: cache, hasPendingWrites: false } }); }
let stop: (() => void) | undefined;
beforeEach(async () => {
  await initBackend(); await getBackend().clear(ALL_STORES); photosStore.set([]);
  mocks.getBytes.mockReset().mockResolvedValue(new Uint8Array([255, 216, 255]).buffer);
  mocks.unsubscribe.mockClear();
  stop = await startPhotoSync({} as never, {} as never, 'family', 'frame');
});
afterEach(() => { stop?.(); });

describe('cloud photo mirror', () => {
  it('recovers a download that exhausted retries in an earlier offline session', async () => {
    await syncQueueRepo.put({ id: 'photo:one', domain: 'photo', op: 'create', direction: 'inbox',
      payload: { photoId: 'one', cloud: source('one'), retryRevision: 3 }, attempts: 6,
      lastError: 'Network unavailable', status: 'failed', createdAt: 1, updatedAt: 1 });
    emit(['one']);
    await vi.waitFor(async () => {
      expect((await cloudPhotoMapRepo.list()).length).toBe(1);
      expect(await syncQueueRepo.get('photo:one')).toBeUndefined();
    });
  });
  it('applies removal promptly while an unrelated download is stalled', async () => {
    emit(['cached']);
    await vi.waitFor(async () => expect((await cloudPhotoMapRepo.list()).length).toBe(1));
    let finish!: (bytes: ArrayBuffer) => void;
    mocks.getBytes.mockImplementationOnce(() => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }));
    emit(['cached', 'waiting']);
    await vi.waitFor(() => expect(mocks.getBytes).toHaveBeenCalledTimes(2));
    try {
      emit(['waiting']);
      await vi.waitFor(async () => expect(await cloudPhotoMapRepo.get('cached')).toBeUndefined());
    } finally { finish(new Uint8Array([255, 216, 255]).buffer); }
    await vi.waitFor(async () => expect((await cloudPhotoMapRepo.list()).map((m) => m.cloudPhotoId)).toEqual(['waiting']));
  });
  it('removes cached files and mapping when a server photo is deleted', async () => {
    emit(['one']); await vi.waitFor(async () => expect((await photoRepo.list()).length).toBe(1));
    const mapping = (await cloudPhotoMapRepo.list())[0]!;
    emit([]);
    await vi.waitFor(async () => expect(await cloudPhotoMapRepo.list()).toEqual([]));
    expect(await photoRepo.getBlob(mapping.localPhotoId)).toBeNull();
    expect(await photoRepo.getThumbnail(mapping.localPhotoId)).toBeNull();
    expect(photosStore.get()).toEqual([]);
  });
  it('keeps downloads during a cached empty snapshot, then applies offline deletion on server reconnect', async () => {
    emit(['one']); await vi.waitFor(async () => expect((await cloudPhotoMapRepo.list()).length).toBe(1));
    stop?.(); stop = await startPhotoSync({} as never, {} as never, 'family', 'frame');
    emit([], true);
    expect((await photoRepo.list()).length).toBe(1);
    emit([]);
    await vi.waitFor(async () => expect(await photoRepo.list()).toEqual([]));
  });
  it('does not restore a photo deleted while its download is in progress', async () => {
    let finish!: (bytes: ArrayBuffer) => void;
    mocks.getBytes.mockImplementationOnce(() => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }));
    emit(['deleted']);
    await vi.waitFor(() => expect(mocks.getBytes).toHaveBeenCalledOnce());
    emit(['keep']); finish(new Uint8Array([255, 216, 255]).buffer);
    await vi.waitFor(async () => expect((await cloudPhotoMapRepo.list()).map((m) => m.cloudPhotoId)).toEqual(['keep']));
    expect((await photoRepo.list()).map((p) => p.filename)).toEqual(['keep.jpg']);
  });
  it('leaves local-only and other-family photos intact', async () => {
    const local = { id: 'local', filename: 'local.jpg', mimeType: 'image/jpeg', createdAt: 1, favorite: false, size: 3 };
    const foreign = { ...local, id: 'foreign' };
    await photoRepo.add(local, new Blob(['123']), null);
    await photoRepo.add(foreign, new Blob(['123']), null);
    await cloudPhotoMapRepo.put({ cloudPhotoId: 'foreign', localPhotoId: 'foreign', familyId: 'other', frameId: 'frame', syncedAt: 1 });
    emit(['one']);
    await vi.waitFor(async () => expect((await photoRepo.list()).length).toBe(3));
    emit([]);
    await vi.waitFor(async () => expect((await photoRepo.list()).length).toBe(2));
    expect((await photoRepo.list()).map((p) => p.id).sort()).toEqual(['foreign', 'local']);
  });
  it('deduplicates cached/server snapshots and releases the subscription', async () => {
    emit(['one'], true); emit(['one']); emit(['one']);
    await vi.waitFor(async () => expect((await photoRepo.list()).length).toBe(1));
    expect((await cloudPhotoMapRepo.list()).length).toBe(1);
    stop?.(); stop = undefined;
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    emit(['two']);
    expect((await photoRepo.list()).length).toBe(1);
  });
});
