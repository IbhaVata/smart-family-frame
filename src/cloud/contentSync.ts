/**
 * Generic cloud -> local sync for one Firestore subcollection (calendar events, notes, reminders,
 * household records). Writes go through the SAME repository + store the existing V1 UI already reads
 * and writes (src/storage/repositories.ts, src/app/stores.ts), so once an item lands locally, every
 * existing V1 feature (slideshow, reminder engine, calendar views, household calculations) picks it up
 * for free — no second "remote" data path is created, per V2_SYNC.md's local-first design principle.
 *
 * Most content is cloud -> frame. Household records are the exception: the Frame is also the canonical
 * setup/payment UI, so local Household edits are mirrored through the IndexedDB outbox in
 * householdOutbox.ts and safely retried after an offline session.
 */
import type { Firestore, DocumentData, Unsubscribe } from 'firebase/firestore';
import type { Store } from '@/app/store';
import { toast } from '@/app/stores';

export interface RemoteRepo<T extends { id: string }> {
  put: (item: T) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export interface WatchRemoteCollectionOptions<T extends { id: string }> {
  db: Firestore;
  path: string;
  repo: RemoteRepo<T>;
  store: Store<T[]>;
  /** Validates and coerces a cloud document into the local domain type. Return null to skip a malformed doc. */
  parse: (id: string, data: DocumentData) => T | null;
  label: string;
  /** Called once per newly-applied item (not on removals) — used for "New note from Mom" style toasts. */
  onApplied?: (item: T, changeType: 'added' | 'modified') => void;
  onError?: (error: unknown) => void;
}

/** Starts watching a Firestore subcollection and mirrors it into local storage. Returns an unsubscribe fn. */
export async function watchRemoteCollection<T extends { id: string }>(opts: WatchRemoteCollectionOptions<T>): Promise<Unsubscribe> {
  const { collection, onSnapshot } = await import('firebase/firestore');
  const ref = collection(opts.db, opts.path);
  let active = true;
  let pending = Promise.resolve();
  const unsubscribe = onSnapshot(
    ref,
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const id = change.doc.id;
        // Serialize writes so an older slow write cannot finish after a newer update/removal.
        pending = pending.then(async () => {
          if (!active) return;
          if (change.type === 'removed') {
            await opts.repo.remove(id);
            if (active) opts.store.set((list) => list.filter((x) => x.id !== id));
            return;
          }
          const item = opts.parse(id, change.doc.data());
          if (!item) return;
          await opts.repo.put(item);
          if (!active) return;
          opts.store.set((list) => (list.some((x) => x.id === id) ? list.map((x) => x.id === id ? item : x) : [...list, item]));
          opts.onApplied?.(item, change.type === 'added' ? 'added' : 'modified');
        }).catch((error) => { if (active) opts.onError?.(error); });
      }
    },
    (error) => {
      console.error(`[sync] ${opts.label} listener failed`, error);
      toast(`Sync problem with ${opts.label}. It will retry automatically.`, 'error');
      if (active) opts.onError?.(error);
    },
  );
  return () => { active = false; unsubscribe(); };
}
