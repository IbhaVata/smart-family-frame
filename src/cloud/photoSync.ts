/** Cloud photo mirror with authoritative removal, atomic persistence and cancellable retries. */
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { PhotoMeta } from '@/types';
import type { CloudPhoto, CloudPhotoMap, SyncQueueItem } from '../../shared/types';
import { ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_BYTES } from '../../shared/types';
import { getBackend } from '@/storage/backend';
import { cloudPhotoMapRepo, syncQueueRepo } from '@/storage/repositories';
import { photosStore, toast } from '@/app/stores';
import { newId } from '@/utils/id';
import { decodeImage } from '@/services/imageProcessing';
import { validatePhotoFile } from '@/utils/files';

const MAX_ATTEMPTS = 6;
const RETRY_REVISION = 3;
async function downloadViaCallable(cloud: CloudPhoto, photoId: string): Promise<ArrayBuffer> {
  const [{ httpsCallable, getFunctions }, { getApp }] = await Promise.all([import('firebase/functions'), import('firebase/app')]);
  const result = await httpsCallable<{ familyId: string; photoId: string }, { bytesBase64: string }>(getFunctions(getApp()), 'getPhotoDownloadUrl')({
    familyId: cloud.familyId,
    photoId,
  });
  const binary = atob(result.data.bytesBase64);
  if (binary.length > MAX_PHOTO_BYTES) throw new Error('Downloaded photo exceeds the allowed size.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}


export async function startPhotoSync(db: Firestore, storage: FirebaseStorage, familyId: string, frameId: string, onError?: (error: unknown) => void): Promise<() => void> {
  const { collection, query, where, onSnapshot } = await import('firebase/firestore');
  const { ref, getBytes } = await import('firebase/storage');
  let active = true;
  let serverIds: Set<string> | null = null;
  let pending = Promise.resolve();
  let removals = Promise.resolve();
  const records = new Map<string, CloudPhoto>();
  const queued = new Set<string>();
  const attemptsThisSession = new Map<string, number>();
  const retries = new Map<string, ReturnType<typeof setTimeout>>();
  const allowed = (id: string) => active && (serverIds === null || serverIds.has(id));
  const sameScope = (map: CloudPhotoMap) => (!map.familyId || map.familyId === familyId) && (!map.frameId || map.frameId === frameId);
  const enqueue = (work: () => Promise<void>) => {
    pending = pending.then(async () => { if (active) await work(); }).catch((error) => { if (active) onError?.(error); });
  };

  async function removeCopies(maps: CloudPhotoMap[], queue: SyncQueueItem[]): Promise<void> {
    const deletions = maps.flatMap((map) => [
      { store: 'photos' as const, key: map.localPhotoId },
      { store: 'photoBlobs' as const, key: map.localPhotoId },
      { store: 'thumbnails' as const, key: map.localPhotoId },
      { store: 'cloudPhotoMap' as const, key: map.cloudPhotoId },
      { store: 'syncQueue' as const, key: `photo:${map.cloudPhotoId}` },
    ]);
    await getBackend().deleteMany([...deletions, ...queue.map((item) => ({ store: 'syncQueue' as const, key: item.id }))]);
    if (active) {
      const removed = new Set(maps.map((m) => m.localPhotoId));
      photosStore.set((list) => list.filter((photo) => !removed.has(photo.id)));
    }
  }

  async function reconcileRemovals(): Promise<void> {
    const [maps, queue] = await Promise.all([cloudPhotoMapRepo.list(), syncQueueRepo.list()]);
    if (!active || serverIds === null) return;
    // A cached empty query is not proof of deletion. Only a complete server snapshot may prune.
    const removed = maps.filter((map) => sameScope(map) && !serverIds!.has(map.cloudPhotoId));
    const staleQueue = queue.filter((item) => {
      const payload = item.payload as { photoId?: string; cloud?: CloudPhoto } | undefined;
      return item.domain === 'photo' && payload?.cloud?.familyId === familyId && payload.cloud.frameId === frameId
        && !!payload.photoId && !serverIds!.has(payload.photoId);
    });
    await removeCopies(removed, staleQueue);
  }

  async function download(photoId: string, cloud: CloudPhoto): Promise<void> {
    if (!allowed(photoId)) return;
    const queueId = `photo:${photoId}`;
    try {
      if (cloud.familyId !== familyId || cloud.frameId !== frameId || !Number.isFinite(cloud.size) || cloud.size <= 0 || cloud.size > MAX_PHOTO_BYTES
        || !(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(cloud.mimeType)) throw new Error('Unsupported cloud photo metadata.');
      const already = await cloudPhotoMapRepo.get(photoId);
      if (!allowed(photoId) || already) return;
      let bytes: ArrayBuffer;
      try { bytes = await getBytes(ref(storage, cloud.storagePath), MAX_PHOTO_BYTES); }
      catch (error) {
        if ((error as { code?: string })?.code !== 'storage/retry-limit-exceeded' || !allowed(photoId)) throw error;
        bytes = await downloadViaCallable(cloud, photoId);
      }
      if (!allowed(photoId)) return;
      const blob = new Blob([bytes], { type: cloud.mimeType });
      const validation = validatePhotoFile(new File([blob], cloud.filename || photoId, { type: cloud.mimeType }));
      if (!validation.ok) throw new Error(validation.reason || 'Unsupported photo.');
      const decoded = await decodeImage(blob);
      if (!allowed(photoId)) return;
      const meta: PhotoMeta = { id: newId(), filename: cloud.filename || photoId, mimeType: validation.mimeType,
        createdAt: cloud.uploadedAt, favorite: false, size: bytes.byteLength, width: decoded.width, height: decoded.height };
      const mapping: CloudPhotoMap = { cloudPhotoId: photoId, localPhotoId: meta.id, syncedAt: Date.now(), familyId, frameId };
      // Photo bytes and dedup identity commit together, including across crashes or quota failures.
      await getBackend().putMany([
        { store: 'photos', value: meta }, { store: 'photoBlobs', value: { id: meta.id, blob } },
        ...(decoded.thumbnail ? [{ store: 'thumbnails' as const, value: { id: meta.id, blob: decoded.thumbnail } }] : []),
        { store: 'cloudPhotoMap', value: mapping },
      ]);
      if (!allowed(photoId)) {
        if (active) await removeCopies([mapping], []);
        return;
      }
      photosStore.set((list) => [...list.filter((photo) => photo.id !== meta.id), meta]);
      await syncQueueRepo.remove(queueId);
      toast(`New photo from ${cloud.uploadedByName || 'a family member'}.`, 'success');
      try {
        const [{ httpsCallable, getFunctions }, { getApp }] = await Promise.all([import('firebase/functions'), import('firebase/app')]);
        if (allowed(photoId)) await httpsCallable(getFunctions(getApp()), 'confirmPhotoSynced')({ familyId, photoId });
      } catch { /* Download is safely stored; confirmation is informational. */ }
    } catch (error) {
      if (!allowed(photoId)) return;
      const previous = await syncQueueRepo.get(queueId);
      if (!allowed(photoId)) return;
      // Bound retries within one active session, but allow a fresh authenticated connection to
      // recover a photo that failed during an earlier, prolonged outage.
      const attempts = (attemptsThisSession.get(photoId) ?? 0) + 1;
      attemptsThisSession.set(photoId, attempts);
      await syncQueueRepo.put({ id: queueId, domain: 'photo', op: 'create', direction: 'inbox',
        payload: { photoId, cloud, retryRevision: RETRY_REVISION }, attempts,
        lastError: error instanceof Error ? error.message : 'Photo download failed.',
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', createdAt: previous?.createdAt ?? Date.now(), updatedAt: Date.now() });
      if (active && !allowed(photoId)) { await syncQueueRepo.remove(queueId); return; }
      if (allowed(photoId) && attempts < MAX_ATTEMPTS) {
        const timer = setTimeout(() => { retries.delete(photoId); schedule(photoId); }, Math.min(300_000, 5_000 * 2 ** (attempts - 1)));
        const old = retries.get(photoId); if (old) clearTimeout(old);
        retries.set(photoId, timer);
      } else if (allowed(photoId)) {
        toast('Photo download interrupted. Reconnecting to retry.', 'error');
        onError?.(error);
      }
    }
  }

  function schedule(id: string) {
    if (queued.has(id) || retries.has(id) || !allowed(id) || (attemptsThisSession.get(id) ?? 0) >= MAX_ATTEMPTS) return;
    const cloud = records.get(id);
    if (!cloud) return;
    queued.add(id);
    enqueue(async () => { try { await download(id, records.get(id) ?? cloud); } finally { queued.delete(id); } });
  }

  const unsubscribe = onSnapshot(query(collection(db, 'families', familyId, 'photos'), where('frameId', '==', frameId)),
    { includeMetadataChanges: true }, (snapshot) => {
      if (!active) return;
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
        serverIds = new Set(snapshot.docs.map((document) => document.id));
        for (const [id, timer] of retries) if (!serverIds.has(id)) { clearTimeout(timer); retries.delete(id); }
        // Deletions must not wait behind an unrelated slow network download. Local transactions
        // remain ordered, and allowed() prevents an in-flight removed photo from being restored.
        removals = removals.then(async () => { if (active) await reconcileRemovals(); })
          .catch((error) => { if (active) onError?.(error); });
      }
      for (const document of snapshot.docs) { records.set(document.id, document.data() as CloudPhoto); schedule(document.id); }
    }, (error) => {
      if (!active) return;
      if (onError) onError(error);
      else toast('Photo sync interrupted. Reopen the app to retry.', 'error');
    });
  return () => { active = false; unsubscribe(); for (const timer of retries.values()) clearTimeout(timer); retries.clear(); };
}
