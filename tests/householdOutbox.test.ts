import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  call: vi.fn(),
}));
vi.mock('../src/cloud/firebaseApp', () => ({ getCloudServices: async () => ({ app: {} }) }));
vi.mock('../src/cloud/frameIdentity', () => ({
  getFrameIdentity: async () => ({ frameId: 'FRAME-TEST12', deviceUid: 'device', familyId: 'fam' }),
  ensureDeviceAuth: async () => 'device',
}));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => state.call }));

const backendMod = await import('@/storage/backend');
const { syncQueueRepo } = await import('@/storage/repositories');
const outbox = await import('@/cloud/householdOutbox');

const entry = (note: string) => ({ id: 'e1', serviceId: 's1', date: '2026-11-11', note, updatedAt: Date.now() }) as never;
const queued = async () => (await syncQueueRepo.list()).filter((i) => i.domain === 'household');

describe('household outbox', () => {
  beforeAll(async () => {
    await backendMod.initBackend();
  });
  beforeEach(async () => {
    for (const item of await syncQueueRepo.list()) await syncQueueRepo.remove(item.id);
    state.call.mockReset();
  });

  it('keeps an edit saved while the cloud call is in flight', async () => {
    let release!: () => void;
    state.call.mockReturnValueOnce(new Promise<void>((r) => (release = r)));
    state.call.mockResolvedValue({ data: { ok: true } });
    await outbox.queueHouseholdUpsert('householdEntries', entry('first'));
    await vi.waitFor(() => expect(state.call).toHaveBeenCalledTimes(1));

    await outbox.queueHouseholdUpsert('householdEntries', entry('second'));
    release();
    await outbox.flushHouseholdOutbox();

    const left = await queued();
    expect(left).toHaveLength(1);
    expect((left[0]!.payload as { data: { note: string } }).data.note).toBe('second');
    expect(left[0]!.status).toBe('pending');
  });

  it('retries items stranded in syncing by a crash mid-flush', async () => {
    state.call.mockRejectedValueOnce(new Error('offline'));
    await outbox.queueHouseholdUpsert('householdEntries', entry('x'));
    await outbox.flushHouseholdOutbox();
    const [item] = await queued();
    await syncQueueRepo.put({ ...item!, status: 'syncing' });

    state.call.mockResolvedValue({ data: { ok: true } });
    await outbox.flushHouseholdOutbox();
    expect(await queued()).toHaveLength(0);
  });
});
