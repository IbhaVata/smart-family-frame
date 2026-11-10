import { initBackend } from '@/storage/backend';
import { settingsRepo, eventRepo, noteRepo, reminderRepo, scheduleRepo, householdServiceRepo, householdEntryRepo, householdPaymentRepo, householdServiceSettingsRepo } from '@/storage/repositories';
import { settingsStore, eventsStore, notesStore, remindersStore, schedulesStore, statusStore, viewStore, householdServicesStore, householdEntriesStore, householdPaymentsStore, householdServiceSettingsStore } from '@/app/stores';
import { loadPhotos } from './photoService';
import { startTicker, tickNow } from './ticker';
import { describeError } from '@/storage/errors';
import { wasFrameActive } from '@/frame/frameSession';
import { startSyncEngine } from '@/cloud/syncEngine';
import { getFrameIdentity } from '@/cloud/frameIdentity';
import { getTvMode } from '@/tv/platform';

/** Loads everything from local storage into the in-memory stores and decides which screen to show. */
export async function bootstrap(): Promise<void> {
  const { backend, error } = await initBackend();
  // Ask the browser not to evict our photos under storage pressure. Chrome grants this silently once the
  // site is installed as an app or used regularly; until then storage is "best-effort". We keep the real
  // answer so Settings can show it honestly instead of claiming "Persistent".
  let persisted: boolean | null = null;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      persisted = await Promise.race<boolean | null>([
        navigator.storage.persist().catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
    }
  } catch {
    persisted = null;
  }
  let loadError: string | undefined = error;
  try {
    const [settings, events, notes, reminders, schedules, householdServices, householdEntries, householdPayments, householdServiceSettings] = await Promise.all([
      settingsRepo.load(),
      eventRepo.list(),
      noteRepo.list(),
      reminderRepo.list(),
      scheduleRepo.list(),
      householdServiceRepo.list(), householdEntryRepo.list(), householdPaymentRepo.list(), householdServiceSettingsRepo.list(),
    ]);
    settingsStore.set(settings);
    eventsStore.set(events);
    notesStore.set(notes);
    remindersStore.set(reminders);
    schedulesStore.set(schedules);
    householdServicesStore.set(householdServices);
    householdEntriesStore.set(householdEntries);
    householdPaymentsStore.set(householdPayments);
    householdServiceSettingsStore.set(householdServiceSettings);
    await loadPhotos();
    // The installed TV has one stable device identity even before cloud sharing is configured.
    if (getTvMode()) await getFrameIdentity();
  } catch (e) {
    loadError = describeError(e);
    console.error('[bootstrap] failed to load data', e);
  }
  startTicker();
  // Evaluate reminders/schedules against the real current time immediately: without this, the first
  // evaluation waits for the next minute boundary (up to 60s away), and the strict 10-minute reminder
  // grace window effectively shrinks to as little as 9 minutes for a reminder that became due just
  // before this frame was opened (e.g. reopening the app shortly after it was closed at the due time).
  tickNow();
  statusStore.set({ ready: true, storage: backend.kind, storageError: loadError, persisted });
  const setupComplete = settingsStore.get().setupComplete;
  // A boot-time read failure means "this frame's configuration could not be read", not "this frame was
  // never set up": routing to Setup in that case would let the owner press START and overwrite whatever
  // real settings exist with defaults (SetupScreen merges its patch onto settingsStore's CURRENT value,
  // which is DEFAULT_SETTINGS here because the load failed). Stay on the management screen instead - the
  // storage-problem banner is already shown there - so a transient failure can never silently erase a
  // configured frame's settings.
  const screen = loadError ? 'manage' : !setupComplete ? 'setup' : wasFrameActive() ? 'frame' : 'manage';
  viewStore.set({ screen, tab: 'frame' });
  // V2 cloud sync: entirely optional and non-blocking. startSyncEngine() never throws (every failure
  // path degrades to a "not configured"/"error" status) and is never awaited here, so a slow or
  // unreachable Firebase project can never delay first paint or block Frame Mode.
  void startSyncEngine().catch((e) => console.error('[bootstrap] sync engine failed to start', e));
}
