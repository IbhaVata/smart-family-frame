/**
 * V2 sync orchestrator. Starts once at boot (see src/services/bootstrap.ts) and:
 *  - does nothing (and shows "not_configured") if Firebase env vars are absent — V1 is fully unaffected;
 *  - does nothing (and shows "not_paired") if this Frame has never been paired to a family;
 *  - otherwise authenticates the device, opens the per-domain Firestore listeners (contentSync.ts /
 *    photoSync.ts / settingsSync.ts) and a low-frequency heartbeat, and reflects status into
 *    `remoteSharingStore` for the Settings -> Remote Sharing screen.
 *
 * Every failure path here degrades to "cloud unavailable" — it must never throw out of start(), and a
 * failed/slow network must never block or blank Frame Mode (V2 build §72).
 */
import { eventRepo, noteRepo, reminderRepo, householdEntryRepo, householdPaymentRepo, householdServiceRepo, householdServiceSettingsRepo, syncQueueRepo } from '@/storage/repositories';
import { eventsStore, notesStore, remindersStore, householdEntriesStore, householdPaymentsStore, householdServicesStore, householdServiceSettingsStore, remoteSharingStore } from '@/app/stores';
import type { CalendarEvent, Note, Reminder, HouseholdService, HouseholdDailyEntry, HouseholdPayment, HouseholdServiceSettings } from '@/types';
import { isCloudConfigured } from './env';
import { getCloudServices } from './firebaseApp';
import { ensureDeviceAuth, getFrameIdentity, recordPairing, clearPairing } from './frameIdentity';
import { watchRemoteCollection } from './contentSync';
import { startPhotoSync } from './photoSync';
import { watchRemoteSettings } from './settingsSync';
import { startHeartbeat, stopHeartbeat } from './heartbeat';
import { flushHouseholdOutbox, seedLocalHouseholdOutbox } from './householdOutbox';
import { createSyncLifecycle, type SyncAttempt } from './syncLifecycle';
import { parseRemoteReminder } from './reminderSync';

type Unsub = () => void;


function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function parseEvent(id: string, data: Record<string, unknown>): CalendarEvent | null {
  if (typeof data.title !== 'string' || typeof data.date !== 'string') return null;
  const event: CalendarEvent = { id, title: data.title, date: data.date, description: str(data.description), allDay: Boolean(data.allDay), createdAt: num(data.createdAt, Date.now()), updatedAt: num(data.updatedAt, Date.now()) };
  if (typeof data.startTime === 'string') event.startTime = data.startTime;
  if (typeof data.endTime === 'string') event.endTime = data.endTime;
  return event;
}
function parseNote(id: string, data: Record<string, unknown>): Note | null {
  if (typeof data.title !== 'string' && typeof data.message !== 'string') return null;
  const note: Note = { id, title: str(data.title), message: str(data.message), pinned: Boolean(data.pinned), createdAt: num(data.createdAt, Date.now()), updatedAt: num(data.updatedAt, Date.now()) };
  if (typeof data.displayStart === 'string') note.displayStart = data.displayStart;
  if (typeof data.displayEnd === 'string') note.displayEnd = data.displayEnd;
  return note;
}
function parseReminder(id: string, data: Record<string, unknown>): Reminder | null {
  return parseRemoteReminder(id, data, remindersStore.get().find((reminder) => reminder.id === id));
}
function parseHouseholdService(id: string, data: Record<string, unknown>): HouseholdService | null {
  if (typeof data.name !== 'string' || typeof data.type !== 'string') return null;
  return {
    id, name: data.name, type: data.type as HouseholdService['type'], vendorName: str(data.vendorName), startDate: str(data.startDate),
    endDate: typeof data.endDate === 'string' ? data.endDate : undefined,
    paymentType: (data.paymentType as HouseholdService['paymentType']) ?? 'MONTHLY_FIXED', rate: num(data.rate), status: (data.status as HouseholdService['status']) ?? 'ACTIVE',
    notes: str(data.notes), createdAt: num(data.createdAt, Date.now()), updatedAt: num(data.updatedAt, Date.now()),
  };
}
function parseHouseholdEntry(id: string, data: Record<string, unknown>): HouseholdDailyEntry | null {
  if (typeof data.serviceId !== 'string' || typeof data.date !== 'string') return null;
  return {
    id, serviceId: data.serviceId, date: data.date,
    attendance: data.attendance as HouseholdDailyEntry['attendance'] | undefined,
    delivery: data.delivery as HouseholdDailyEntry['delivery'] | undefined,
    quantity: typeof data.quantity === 'number' ? data.quantity : undefined,
    amount: typeof data.amount === 'number' ? data.amount : undefined,
    note: str(data.note), updatedAt: num(data.updatedAt, Date.now()),
  };
}
function parseHouseholdPayment(id: string, data: Record<string, unknown>): HouseholdPayment | null {
  if (typeof data.serviceId !== 'string' || typeof data.month !== 'string') return null;
  return {
    id, serviceId: data.serviceId, month: data.month, expectedAmount: num(data.expectedAmount), status: (data.status as HouseholdPayment['status']) ?? 'UNPAID',
    paidAmount: num(data.paidAmount), paymentDate: typeof data.paymentDate === 'string' ? data.paymentDate : undefined, note: str(data.note), updatedAt: num(data.updatedAt, Date.now()),
  };
}
function parseHouseholdServiceSettings(id: string, data: Record<string, unknown>): HouseholdServiceSettings | null {
  if (typeof data.serviceId !== 'string') return null;
  return {
    id, serviceId: data.serviceId, deductionMethod: (data.deductionMethod as HouseholdServiceSettings['deductionMethod']) ?? 'NO_DEDUCTION',
    customDailyDeduction: num(data.customDailyDeduction), scheduleDays: Array.isArray(data.scheduleDays) ? (data.scheduleDays as number[]) : [],
    defaultQuantity: num(data.defaultQuantity, 1), unit: str(data.unit),
  };
}

async function watchFamilyMembers(db: import('firebase/firestore').Firestore, familyId: string): Promise<Unsub> {
  const { collection, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    collection(db, 'families', familyId, 'members'),
    (snap) => {
      const members = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return { uid: d.id, displayName: str(data.displayName, 'Family member'), role: (data.role === 'OWNER' ? 'OWNER' : 'MEMBER') as 'OWNER' | 'MEMBER', status: (data.status === 'REVOKED' ? 'REVOKED' : 'ACTIVE') as 'ACTIVE' | 'REVOKED' };
      });
      remoteSharingStore.set((s) => ({ ...s, members }));
    },
    (error) => console.error('[syncEngine] members listener failed', error),
  );
}

async function refreshPendingCount(): Promise<void> {
  const items = await syncQueueRepo.list().catch(() => []);
  remoteSharingStore.set((s) => ({ ...s, pendingCount: items.filter((i) => i.status === 'pending' || i.status === 'syncing').length }));
}

/** The device's own frame record stays watched even when the pairing screen is closed. */
async function connect(attempt: SyncAttempt): Promise<void> {
  let identity = await getFrameIdentity();
  attempt.check();
  remoteSharingStore.set((s) => ({ ...s, frameId: identity.frameId, status: 'connecting' }));
  const services = await getCloudServices();
  attempt.check();
  if (!services) throw new Error('Remote sharing could not be initialized.');
  const deviceUid = await ensureDeviceAuth();
  attempt.check();
  if (!deviceUid) throw new Error('Could not sign in. Local content is available; connection will retry.');
  const { db, storage, functions } = services;
  const { doc, getDoc, onSnapshot } = await import('firebase/firestore');
  attempt.check();
  const ownRef = doc(db, 'frames', identity.frameId);
  try {
    const snapshot = await getDoc(ownRef);
    attempt.check();
    const frame = snapshot.data() as { deviceUid?: string; familyId?: string; familyName?: string } | undefined;
    if (!snapshot.metadata.fromCache && frame?.deviceUid === deviceUid) {
      if (frame.familyId && frame.familyId !== identity.familyId) {
        await recordPairing(frame.familyId, frame.familyName ?? 'Family');
      } else if (!frame.familyId && identity.familyId) {
        await clearPairing();
      }
      attempt.check();
      identity = await getFrameIdentity();
      attempt.check();
    }
  } catch (error) {
    attempt.check();
    if ((error as { code?: string })?.code !== 'permission-denied' || identity.familyId) throw error;
    // A brand-new frame has no cloud document until createPairingCode registers it. That callable
    // restarts this engine afterwards, so no polling is necessary while it has never been registered.
    remoteSharingStore.set((s) => ({ ...s, status: 'not_paired' }));
    return;
  }

  const familyAtStart = identity.familyId;
  attempt.own(onSnapshot(ownRef, { includeMetadataChanges: true }, (snapshot) => {
    if (!attempt.current() || snapshot.metadata.fromCache) return;
    const frame = snapshot.data() as { deviceUid?: string; familyId?: string } | undefined;
    if (frame?.deviceUid !== deviceUid) return;
    if ((frame.familyId || null) !== familyAtStart) attempt.retry(0);
  }, (error) => {
    if (!attempt.current()) return;
    remoteSharingStore.set((s) => ({ ...s, status: 'error', errorMessage: error.message }));
    attempt.retry();
  }));

  if (!identity.familyId) {
    remoteSharingStore.set((s) => ({ ...s, status: 'not_paired', familyId: null, familyName: null }));
    return;
  }
  const { familyId, frameId } = identity;
  remoteSharingStore.set((s) => ({ ...s, familyId, familyName: identity.familyName }));
  const failure = (error: unknown) => {
    if (!attempt.current()) return;
    remoteSharingStore.set((s) => ({ ...s, status: 'error', errorMessage: error instanceof Error ? error.message : 'Sync interrupted.' }));
    attempt.retry();
  };
  // Own each listener as soon as it is created. A later setup failure or a concurrent restart must
  // never leave the already-created listeners or photo retry timers running.
  const watch = async <T extends { id: string }>(path: string, repo: import('./contentSync').RemoteRepo<T>, store: import('@/app/store').Store<T[]>, parse: (id: string, data: Record<string, unknown>) => T | null, label: string) => {
    attempt.check();
    attempt.own(await watchRemoteCollection({ db, path: `frames/${frameId}/${path}`, repo, store, parse, label, onError: failure }));
    attempt.check();
  };
  await watch('calendarEvents', eventRepo, eventsStore, parseEvent, 'calendar');
  await watch('notes', noteRepo, notesStore, parseNote, 'notes');
  await watch('reminders', reminderRepo, remindersStore, parseReminder, 'reminders');
  await watch('householdServices', householdServiceRepo, householdServicesStore, parseHouseholdService, 'household services');
  await watch('householdEntries', householdEntryRepo, householdEntriesStore, parseHouseholdEntry, 'household entries');
  await watch('householdPayments', householdPaymentRepo, householdPaymentsStore, parseHouseholdPayment, 'household payments');
  await watch('householdServiceSettings', householdServiceSettingsRepo, householdServiceSettingsStore, parseHouseholdServiceSettings, 'household settings');
  attempt.own(await startPhotoSync(db, storage, familyId, frameId, failure));
  attempt.check();
  attempt.own(await watchRemoteSettings(db, frameId));
  attempt.check();
  attempt.own(startHeartbeat(functions, frameId));
  attempt.own(await watchFamilyMembers(db, familyId));
  attempt.check();
  // The outbox retries on its own; an IndexedDB hiccup here must not tear down every listener.
  void seedLocalHouseholdOutbox().catch((error) => console.error('[sync] household outbox seed failed', error));
  void refreshPendingCount();
  const pendingTimer = setInterval(() => void refreshPendingCount(), 60_000);
  attempt.own(() => clearInterval(pendingTimer));
  remoteSharingStore.set((s) => ({ ...s, status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connected', lastSyncAt: Date.now(), errorMessage: null }));
}

const lifecycle = createSyncLifecycle(connect, (error) => {
  remoteSharingStore.set((s) => ({ ...s, status: 'offline', errorMessage: error instanceof Error ? error.message : 'Sync will retry.' }));
});
let listening = false;
function online() {
  // Firestore reconnects healthy listeners itself; a full restart re-reads every collection, which on
  // flapping Wi-Fi costs reads and IndexedDB writes many times a day.
  if (remoteSharingStore.get().status !== 'connected') void lifecycle.restart();
  void flushHouseholdOutbox();
}
function offline() { remoteSharingStore.set((s) => ({ ...s, status: 'offline' })); }

export function startSyncEngine(): Promise<void> {
  if (!isCloudConfigured()) {
    remoteSharingStore.set((s) => ({ ...s, status: 'not_configured' }));
    return Promise.resolve();
  }
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    listening = true;
  }
  return lifecycle.start();
}
export function stopSyncEngine(): void {
  lifecycle.stop();
  stopHeartbeat();
  if (listening) {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    listening = false;
  }
}
export function restartSyncEngine(): Promise<void> {
  stopSyncEngine();
  return startSyncEngine();
}
