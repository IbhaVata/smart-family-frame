import type { HouseholdDailyEntry, HouseholdPayment, HouseholdService, HouseholdServiceSettings } from '@/types';
import { getCloudServices } from './firebaseApp';
import { ensureDeviceAuth, getFrameIdentity } from './frameIdentity';
import {
  householdEntryRepo,
  householdPaymentRepo,
  householdServiceRepo,
  householdServiceSettingsRepo,
  syncCursorRepo,
  syncQueueRepo,
} from '@/storage/repositories';

export type HouseholdCloudCollection =
  | 'householdServices'
  | 'householdServiceSettings'
  | 'householdEntries'
  | 'householdPayments';

type HouseholdCloudRecord = HouseholdService | HouseholdServiceSettings | HouseholdDailyEntry | HouseholdPayment;
type HouseholdOutboxPayload = {
  collection: HouseholdCloudCollection;
  docId: string;
  data?: Record<string, unknown>;
};

let flushPromise: Promise<void> | null = null;
const OUTBOX_SEED_REVISION = 2;

function withoutUndefined(record: HouseholdCloudRecord): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function queueId(collection: HouseholdCloudCollection, docId: string): string {
  return `household:${collection}:${docId}`;
}

async function enqueue(collection: HouseholdCloudCollection, docId: string, data?: HouseholdCloudRecord): Promise<void> {
  const now = Date.now();
  const existing = await syncQueueRepo.get(queueId(collection, docId));
  await syncQueueRepo.put({
    id: queueId(collection, docId),
    domain: 'household',
    op: data ? (existing ? 'update' : 'create') : 'delete',
    direction: 'outbox',
    payload: { collection, docId, ...(data ? { data: withoutUndefined(data) } : {}) } satisfies HouseholdOutboxPayload,
    attempts: 0,
    status: 'pending',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function queueHouseholdUpsert(collection: HouseholdCloudCollection, record: HouseholdCloudRecord): Promise<void> {
  await enqueue(collection, record.id, record);
  void flushHouseholdOutbox();
}

export async function queueHouseholdDelete(collection: HouseholdCloudCollection, docId: string): Promise<void> {
  await enqueue(collection, docId);
  void flushHouseholdOutbox();
}

/** Flushes locally committed Household changes. Failures remain pending for the next online/start event. */
export function flushHouseholdOutbox(): Promise<void> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    const [services, identity, uid] = await Promise.all([getCloudServices(), getFrameIdentity(), ensureDeviceAuth()]);
    if (!services || !identity.familyId || !uid || identity.deviceUid !== uid) return;
    const items = (await syncQueueRepo.list()).filter(
      (item) => item.domain === 'household' && item.direction === 'outbox' && item.status === 'pending',
    );
    const valid = items.filter((item) => {
      const payload = item.payload as HouseholdOutboxPayload;
      return Boolean(payload?.collection && payload.docId);
    });
    if (valid.length === 0) return;
    for (const item of valid) {
      await syncQueueRepo.put({ ...item, status: 'syncing', updatedAt: Date.now() });
    }
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const call = httpsCallable<
        { frameId: string; writes: Array<HouseholdOutboxPayload & { op: 'upsert' | 'delete' }> },
        { ok: true }
      >(getFunctions(services.app), 'syncFrameHousehold');
      await call({
        frameId: identity.frameId,
        writes: valid.map((item) => ({
          ...(item.payload as HouseholdOutboxPayload),
          op: item.op === 'delete' ? 'delete' : 'upsert',
        })),
      });
      for (const item of valid) {
        await syncQueueRepo.remove(item.id);
      }
    } catch (error) {
      for (const item of valid) {
        await syncQueueRepo.put({
          ...item,
          attempts: item.attempts + 1,
          lastError: error instanceof Error ? error.message : 'Household cloud write failed.',
          status: 'pending',
          updatedAt: Date.now(),
        });
      }
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

/** Queues the pre-outbox local Household snapshot once; later edits are queued at mutation time. */
export async function seedLocalHouseholdOutbox(): Promise<void> {
  const cursor = await syncCursorRepo.get('household');
  if ((cursor?.lastSyncedAt ?? 0) >= OUTBOX_SEED_REVISION) {
    await flushHouseholdOutbox();
    return;
  }
  const [services, settings, entries, payments] = await Promise.all([
    householdServiceRepo.list(),
    householdServiceSettingsRepo.list(),
    householdEntryRepo.list(),
    householdPaymentRepo.list(),
  ]);
  await Promise.all([
    ...services.map((record) => enqueue('householdServices', record.id, record)),
    ...settings.map((record) => enqueue('householdServiceSettings', record.id, record)),
    ...entries.map((record) => enqueue('householdEntries', record.id, record)),
    ...payments.map((record) => enqueue('householdPayments', record.id, record)),
  ]);
  await syncCursorRepo.set('household', OUTBOX_SEED_REVISION);
  await flushHouseholdOutbox();
}
