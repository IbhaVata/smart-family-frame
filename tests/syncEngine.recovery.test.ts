// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remoteSharingStore } from '../src/app/stores';
import { startSyncEngine, stopSyncEngine } from '../src/cloud/syncEngine';

const state = vi.hoisted(() => ({
  identity: { key: 'device', frameId: 'FRAME-TEST12', deviceUid: 'device', familyId: null as string | null, familyName: null as string | null, pairedAt: null as number | null, createdAt: 1 },
  frame: { deviceUid: 'device', familyId: null as string | null, familyName: 'Family' },
  auth: vi.fn(), watches: [] as { path: string; next: (s: unknown) => void; stop: ReturnType<typeof vi.fn> }[],
  content: vi.fn(), cleanup: vi.fn(),
}));
vi.mock('../src/cloud/env', () => ({ isCloudConfigured: () => true }));
vi.mock('../src/cloud/firebaseApp', () => ({ getCloudServices: async () => ({ db: {}, storage: {}, functions: {} }) }));
vi.mock('../src/cloud/frameIdentity', () => ({
  getFrameIdentity: async () => ({ ...state.identity }), ensureDeviceAuth: state.auth,
  recordPairing: async (id: string, name: string) => { state.identity.familyId = id; state.identity.familyName = name; },
  clearPairing: async () => { state.identity.familyId = null; },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: async () => ({ data: () => ({ ...state.frame }), metadata: { fromCache: false } }),
  onSnapshot: (ref: { path: string }, options: unknown, callback?: (s: unknown) => void) => {
    const stop = vi.fn(); state.watches.push({ path: ref.path, next: (typeof options === 'function' ? options : callback) as (s: unknown) => void, stop }); return stop;
  },
}));
vi.mock('../src/cloud/contentSync', () => ({ watchRemoteCollection: state.content }));
vi.mock('../src/cloud/photoSync', () => ({ startPhotoSync: async () => state.cleanup }));
vi.mock('../src/cloud/settingsSync', () => ({ watchRemoteSettings: async () => state.cleanup }));
vi.mock('../src/cloud/heartbeat', () => ({ startHeartbeat: () => state.cleanup, stopHeartbeat: vi.fn() }));
vi.mock('../src/cloud/householdOutbox', () => ({ flushHouseholdOutbox: async () => {}, seedLocalHouseholdOutbox: async () => {} }));
vi.mock('../src/storage/repositories', () => ({ eventRepo: {}, noteRepo: {}, reminderRepo: {}, householdEntryRepo: {}, householdPaymentRepo: {}, householdServiceRepo: {}, householdServiceSettingsRepo: {}, syncQueueRepo: { list: async () => [] } }));

beforeEach(() => {
  stopSyncEngine(); vi.useFakeTimers();
  state.identity.familyId = null; state.identity.familyName = null; state.frame.familyId = null;
  state.auth.mockReset().mockResolvedValue('device'); state.content.mockReset().mockResolvedValue(state.cleanup);
  state.cleanup.mockClear(); state.watches = [];
});
afterEach(() => { stopSyncEngine(); vi.useRealTimers(); });

describe('connection recovery and background pairing', () => {
  it('recognizes a phone claim without keeping the pairing UI mounted', async () => {
    await startSyncEngine(); expect(remoteSharingStore.get().status).toBe('not_paired');
    state.frame.familyId = 'family';
    state.watches.find((watch) => watch.path.startsWith('frames/'))!.next({ data: () => ({ ...state.frame }), metadata: { fromCache: false } });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(remoteSharingStore.get().status).toBe('connected'));
    expect(state.identity.familyId).toBe('family');
    expect(state.content).toHaveBeenCalled();
  });
  it('retries an initial authentication failure', async () => {
    state.auth.mockResolvedValueOnce(null);
    await startSyncEngine(); expect(remoteSharingStore.get().status).toBe('offline');
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(remoteSharingStore.get().status).toBe('not_paired'));
    expect(state.auth).toHaveBeenCalledTimes(2);
  });
  it('recovers immediately on an online event after failed startup', async () => {
    state.auth.mockResolvedValueOnce(null);
    await startSyncEngine();
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(remoteSharingStore.get().status).toBe('not_paired'));
  });
  it('cleans already-created listeners when setup fails partway through', async () => {
    state.frame.familyId = 'family';
    const first = vi.fn();
    state.content.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Listener initialization failed'));
    await startSyncEngine();
    expect(remoteSharingStore.get().status).toBe('offline');
    expect(first).toHaveBeenCalledOnce();
    expect(state.watches[0]!.stop).toHaveBeenCalledOnce();
  });
});
