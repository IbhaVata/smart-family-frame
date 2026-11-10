import type { PhotoMeta } from '@/types';
import { photosStore, toast } from '@/app/stores';
import { photoRepo } from '@/storage/repositories';
import { validatePhotoFile } from '@/utils/files';
import { newId } from '@/utils/id';
import { decodeImage } from './imageProcessing';
import { toStorageError } from '@/storage/errors';

export interface ImportResult {
  added: PhotoMeta[];
  rejected: { name: string; reason: string }[];
}

export async function loadPhotos(): Promise<void> {
  const list = await photoRepo.list();
  list.sort((a, b) => a.createdAt - b.createdAt);
  photosStore.set(list);
}

/** Imports one or many files. Invalid files are reported, valid ones are stored; nothing throws to the UI. */
export async function importPhotos(files: FileList | File[]): Promise<ImportResult> {
  const result: ImportResult = { added: [], rejected: [] };
  const list = Array.from(files);
  for (const file of list) {
    const v = validatePhotoFile(file);
    if (!v.ok) {
      result.rejected.push({ name: file.name, reason: v.reason ?? 'Unsupported file.' });
      continue;
    }
    let decoded;
    try {
      decoded = await decodeImage(file);
    } catch {
      result.rejected.push({ name: file.name, reason: `"${file.name}" looks corrupted and could not be opened.` });
      continue;
    }
    const meta: PhotoMeta = {
      id: newId(),
      filename: file.name,
      mimeType: v.mimeType,
      createdAt: Date.now(),
      favorite: false,
      size: file.size,
      width: decoded.width,
      height: decoded.height,
    };
    try {
      await photoRepo.add(meta, file, decoded.thumbnail);
      result.added.push(meta);
      photosStore.set((prev) => [...prev, meta]);
    } catch (e) {
      const err = toStorageError(e, 'Saving the photo');
      result.rejected.push({ name: file.name, reason: err.message });
      if (err.kind === 'quota') break; // no point continuing
    }
  }
  return result;
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    await photoRepo.remove(id);
  } catch (e) {
    toast(toStorageError(e, 'Deleting the photo').message, 'error');
    return;
  }
  photosStore.set((prev) => prev.filter((p) => p.id !== id));
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  const current = photosStore.get().find((p) => p.id === id);
  if (!current) return;
  const next = { ...current, favorite };
  photosStore.set((prev) => prev.map((p) => (p.id === id ? next : p)));
  try {
    await photoRepo.updateMeta(next);
  } catch (e) {
    photosStore.set((prev) => prev.map((p) => (p.id === id ? current : p)));
    toast(toStorageError(e, 'Saving the photo').message, 'error');
  }
}

/** Adds a pre-built blob (used by demo data). */
export async function addGeneratedPhoto(filename: string, blob: Blob, favorite = false): Promise<PhotoMeta | null> {
  try {
    const decoded = await decodeImage(blob);
    const meta: PhotoMeta = {
      id: newId(),
      filename,
      mimeType: blob.type || 'image/png',
      createdAt: Date.now(),
      favorite,
      size: blob.size,
      width: decoded.width,
      height: decoded.height,
    };
    await photoRepo.add(meta, blob, decoded.thumbnail);
    photosStore.set((prev) => [...prev, meta]);
    return meta;
  } catch (e) {
    console.error('[photos] failed to add generated photo', e);
    return null;
  }
}

/* ---- Object URL cache with reference counting ------------------------------------------------ */

interface UrlEntry {
  url: string;
  refs: number;
  promise?: Promise<string | null>;
}
const fullUrls = new Map<string, UrlEntry>();
const thumbUrls = new Map<string, UrlEntry>();

async function acquire(map: Map<string, UrlEntry>, id: string, load: (id: string) => Promise<Blob | null>): Promise<string | null> {
  const existing = map.get(id);
  if (existing) {
    existing.refs++;
    return existing.promise ?? existing.url;
  }
  const entry: UrlEntry = { url: '', refs: 1 };
  entry.promise = (async () => {
    try {
      const blob = await load(id);
      if (!blob) {
        if (map.get(id) === entry) map.delete(id);
        return null;
      }
      if (entry.refs <= 0) {
        // Released before it finished loading (e.g. React StrictMode mount/unmount/mount).
        if (map.get(id) === entry) map.delete(id);
        return null;
      }
      entry.url = URL.createObjectURL(blob);
      entry.promise = undefined;
      return entry.url;
    } catch (e) {
      if (map.get(id) === entry) map.delete(id);
      // A thrown error (e.g. the IndexedDB connection was mid-terminated by the browser - db.ts's
      // terminated() handler exists precisely because Chrome does this) is a TRANSIENT failure, not
      // proof the photo is gone. Record it so the caller can avoid permanently excluding this photo
      // from the slideshow over something that will very likely succeed on the next try.
      transientFailures.set(id, Date.now());
      console.error('[photos] failed to load blob', id, e);
      return null;
    }
  })();
  map.set(id, entry);
  return entry.promise;
}

const transientFailures = new Map<string, number>();
const TRANSIENT_WINDOW_MS = 5000;

/**
 * True if `id` most recently resolved to null because of a thrown error rather than because the
 * blob genuinely does not exist (photoRepo.getBlob/getThumbnail resolve to null, without throwing,
 * for a photo that was actually deleted). Callers use this to distinguish "skip this photo forever"
 * from "try again next time it comes up in rotation".
 */
export function wasTransientFailure(id: string): boolean {
  const t = transientFailures.get(id);
  return t !== undefined && Date.now() - t < TRANSIENT_WINDOW_MS;
}

function release(map: Map<string, UrlEntry>, id: string): void {
  const entry = map.get(id);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    map.delete(id);
    if (entry.url) URL.revokeObjectURL(entry.url);
  }
}

/** Full-size photo URL. Callers MUST call releasePhotoUrl with the same id when done. */
export const acquirePhotoUrl = (id: string) => acquire(fullUrls, id, (i) => photoRepo.getBlob(i));
export const releasePhotoUrl = (id: string) => release(fullUrls, id);
/** Thumbnail URL (falls back to the full blob when no thumbnail exists). */
export const acquireThumbUrl = (id: string) => acquire(thumbUrls, id, async (i) => (await photoRepo.getThumbnail(i)) ?? (await photoRepo.getBlob(i)));
export const releaseThumbUrl = (id: string) => release(thumbUrls, id);

export function revokeAllPhotoUrls(): void {
  for (const map of [fullUrls, thumbUrls]) {
    for (const entry of map.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    map.clear();
  }
}
