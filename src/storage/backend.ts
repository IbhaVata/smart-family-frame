import type { IDBPDatabase } from 'idb';
import type { FrameDB, StoreName } from './db';
import { openFrameDB, ALL_STORES } from './db';
import { toStorageError } from './errors';

/** Any stored record; keyed by `id` (content stores) or `key` (settings store). */
type Row = object;

/**
 * Minimal storage backend abstraction. IndexedDB is used when available; otherwise an in-memory
 * backend keeps the app usable for the session (with a visible "not persisted" warning).
 * This abstraction is also what a future ARM/embedded build would swap for a native store.
 */
export interface StorageBackend {
  readonly kind: 'indexeddb' | 'memory';
  getAll<T>(store: StoreName): Promise<T[]>;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T extends Row>(store: StoreName, value: T): Promise<void>;
  putMany(writes: { store: StoreName; value: Row }[]): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  deleteMany(deletes: { store: StoreName; key: string }[]): Promise<void>;
  clear(stores: StoreName[]): Promise<void>;
  /** Atomically replace the content of several stores (used by RESTORE). */
  replaceStores(payload: Partial<Record<StoreName, Row[]>>): Promise<void>;
}

type AnyTx = { done: Promise<void>; abort: () => void };

/**
 * Queues all requests of a batch and waits for the transaction. If queuing throws synchronously (e.g. a
 * record without a key), or any request fails, the transaction is aborted so nothing from the batch is
 * committed (IndexedDB would otherwise auto-commit the requests queued before the failure). The rejections
 * of the other queued requests are swallowed so they never surface as unhandled promise rejections.
 */
async function allOrNothing(tx: AnyTx, queue: (ops: Promise<unknown>[]) => void): Promise<void> {
  const ops: Promise<unknown>[] = [];
  const fail = (e: unknown): never => {
    for (const p of ops) void p.catch(() => undefined);
    void tx.done.catch(() => undefined);
    try {
      tx.abort();
    } catch {
      /* already aborted or finished */
    }
    throw e;
  };
  try {
    queue(ops);
  } catch (e) {
    fail(e);
  }
  try {
    await Promise.all([...ops, tx.done]);
  } catch (e) {
    fail(e);
  }
}

class IndexedDBBackend implements StorageBackend {
  readonly kind = 'indexeddb' as const;

  private async run<R>(fn: (db: IDBPDatabase<FrameDB>) => Promise<R>, context: string): Promise<R> {
    try {
      // openFrameDB() returns the cached connection, or reopens it if it was terminated/closed.
      const db = await openFrameDB();
      return await fn(db);
    } catch (e) {
      throw toStorageError(e, context);
    }
  }

  getAll<T>(store: StoreName): Promise<T[]> {
    return this.run((db) => db.getAll(store as never) as Promise<T[]>, 'Reading data');
  }
  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.run((db) => db.get(store as never, key) as Promise<T | undefined>, 'Reading data');
  }
  put<T extends Row>(store: StoreName, value: T): Promise<void> {
    return this.run(async (db) => {
      await db.put(store as never, value as never);
    }, 'Saving data');
  }
  putMany(writes: { store: StoreName; value: Row }[]): Promise<void> {
    if (writes.length === 0) return Promise.resolve();
    return this.run(async (db) => {
      const names = Array.from(new Set(writes.map((w) => w.store)));
      const tx = db.transaction(names as never, 'readwrite');
      await allOrNothing(tx, (ops) => {
        for (const w of writes) ops.push(tx.objectStore(w.store as never).put(w.value as never));
      });
    }, 'Saving data');
  }
  delete(store: StoreName, key: string): Promise<void> {
    return this.run((db) => db.delete(store as never, key), 'Deleting data');
  }
  deleteMany(deletes: { store: StoreName; key: string }[]): Promise<void> {
    if (deletes.length === 0) return Promise.resolve();
    return this.run(async (db) => {
      const names = Array.from(new Set(deletes.map((d) => d.store)));
      const tx = db.transaction(names as never, 'readwrite');
      await allOrNothing(tx, (ops) => {
        for (const d of deletes) ops.push(tx.objectStore(d.store as never).delete(d.key));
      });
    }, 'Deleting data');
  }
  clear(stores: StoreName[]): Promise<void> {
    if (stores.length === 0) return Promise.resolve();
    return this.run(async (db) => {
      const tx = db.transaction(stores as never, 'readwrite');
      await allOrNothing(tx, (ops) => {
        for (const s of stores) ops.push(tx.objectStore(s as never).clear());
      });
    }, 'Clearing data');
  }
  replaceStores(payload: Partial<Record<StoreName, Row[]>>): Promise<void> {
    const names = Object.keys(payload) as StoreName[];
    if (names.length === 0) return Promise.resolve();
    return this.run(async (db) => {
      const tx = db.transaction(names as never, 'readwrite');
      await allOrNothing(tx, (ops) => {
        for (const name of names) {
          const os = tx.objectStore(name as never);
          ops.push(os.clear());
          for (const row of payload[name] ?? []) ops.push(os.put(row as never));
        }
      });
    }, 'Restoring data');
  }
}

class MemoryBackend implements StorageBackend {
  readonly kind = 'memory' as const;
  private data = new Map<StoreName, Map<string, Row>>();
  private table(store: StoreName): Map<string, Row> {
    let t = this.data.get(store);
    if (!t) {
      t = new Map();
      this.data.set(store, t);
    }
    return t;
  }
  private keyOf(v: Row): string {
    const r = v as { id?: unknown; key?: unknown };
    return typeof r.id === 'string' ? r.id : String(r.key ?? '');
  }
  async getAll<T>(store: StoreName): Promise<T[]> {
    return Array.from(this.table(store).values()) as T[];
  }
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.table(store).get(key) as T | undefined;
  }
  async put<T extends Row>(store: StoreName, value: T): Promise<void> {
    this.table(store).set(this.keyOf(value), value);
  }
  async putMany(writes: { store: StoreName; value: Row }[]): Promise<void> {
    for (const w of writes) this.table(w.store).set(this.keyOf(w.value), w.value);
  }
  async delete(store: StoreName, key: string): Promise<void> {
    this.table(store).delete(key);
  }
  async deleteMany(deletes: { store: StoreName; key: string }[]): Promise<void> {
    for (const d of deletes) this.table(d.store).delete(d.key);
  }
  async clear(stores: StoreName[]): Promise<void> {
    for (const s of stores) this.table(s).clear();
  }
  async replaceStores(payload: Partial<Record<StoreName, Row[]>>): Promise<void> {
    for (const name of Object.keys(payload) as StoreName[]) {
      const t = this.table(name);
      t.clear();
      for (const row of payload[name] ?? []) t.set(this.keyOf(row), row);
    }
  }
}

let backend: StorageBackend | null = null;
let backendError: string | undefined;

/** Opens IndexedDB, or falls back to memory. Never throws. */
export async function initBackend(): Promise<{ backend: StorageBackend; error?: string }> {
  if (backend) return { backend, error: backendError };
  try {
    await openFrameDB();
    backend = new IndexedDBBackend();
  } catch (e) {
    backendError = toStorageError(e).message;
    console.error('[storage] falling back to in-memory storage:', backendError);
    backend = new MemoryBackend();
  }
  return { backend, error: backendError };
}

export function getBackend(): StorageBackend {
  if (!backend) throw new Error('Storage has not been initialised yet.');
  return backend;
}

export function resetBackendForReset(): void {
  backend = null;
  backendError = undefined;
}

export { ALL_STORES };
