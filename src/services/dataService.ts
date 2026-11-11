import type { CalendarEvent, Note, Reminder, Schedule, Settings, HouseholdService, HouseholdDailyEntry, HouseholdPayment, HouseholdServiceSettings } from '@/types';
import { eventsStore, notesStore, remindersStore, schedulesStore, settingsStore, toast, activeRemindersStore } from '@/app/stores';
import { eventRepo, noteRepo, reminderRepo, scheduleRepo, settingsRepo, restoreContent, photoRepo } from '@/storage/repositories';
import { newId } from '@/utils/id';
import { toStorageError } from '@/storage/errors';
import { tickNow } from './ticker';
import type { Store } from '@/app/store';
import type { BackupFile } from '@/settings/backup';
import { createBackup } from '@/settings/backup';
import { photosStore } from '@/app/stores';
import { deleteFrameDB } from '@/storage/db';
import { revokeAllPhotoUrls } from './photoService';
import { getBackend } from '@/storage/backend';
import { householdServicesStore, householdEntriesStore, householdPaymentsStore, householdServiceSettingsStore } from '@/app/stores';
import { householdEntryRepo, householdPaymentRepo } from '@/storage/repositories';
import { toDateKey } from '@/utils/time';
import { occurrenceOnDay } from '@/reminders/reminderLogic';
import { isCloudConfigured } from '@/cloud/env';
import { queueHouseholdDelete, queueHouseholdUpsert } from '@/cloud/householdOutbox';

type Repo<T extends { id: string }> = { put: (item: T) => Promise<void>; remove: (id: string) => Promise<void> };

function fail(e: unknown, context: string): never {
  const err = toStorageError(e, context);
  toast(err.message, 'error');
  throw err;
}

function makeCrud<T extends { id: string }>(store: Store<T[]>, repo: Repo<T>, label: string) {
  return {
    async save(item: T): Promise<T> {
      const previousItem = store.get().find((x) => x.id === item.id);
      store.set((list) => (previousItem !== undefined ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]));
      try {
        await repo.put(item);
      } catch (e) {
        // Roll back only THIS item via a functional update, not the whole list as it was before the
        // call: a whole-list snapshot would erase any other change applied to the store while this
        // write was in flight (e.g. a concurrent save of a different item that succeeded, or the
        // reminder engine's store-first lastTriggeredAt write - see markReminderTriggered below,
        // which relies on the in-memory value as its guard against double-firing).
        store.set((list) => (previousItem !== undefined ? list.map((x) => (x.id === item.id ? previousItem : x)) : list.filter((x) => x.id !== item.id)));
        fail(e, `Saving the ${label}`);
      }
      tickNow();
      return item;
    },
    async remove(id: string): Promise<void> {
      const removedItem = store.get().find((x) => x.id === id);
      store.set((list) => list.filter((x) => x.id !== id));
      try {
        await repo.remove(id);
      } catch (e) {
        if (removedItem) store.set((list) => (list.some((x) => x.id === id) ? list : [...list, removedItem]));
        fail(e, `Deleting the ${label}`);
      }
      tickNow();
    },
  };
}

/* ---- Events ---- */
const eventCrud = makeCrud<CalendarEvent>(eventsStore, eventRepo, 'event');
export type EventDraft = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
export async function saveEvent(draft: EventDraft): Promise<CalendarEvent> {
  const now = Date.now();
  const existing = draft.id ? eventsStore.get().find((e) => e.id === draft.id) : undefined;
  const event: CalendarEvent = {
    id: existing?.id ?? newId(),
    title: draft.title.trim(),
    date: draft.date,
    allDay: draft.allDay,
    description: draft.description.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!draft.allDay) {
    if (draft.startTime) event.startTime = draft.startTime;
    if (draft.endTime) event.endTime = draft.endTime;
  }
  return eventCrud.save(event);
}
export const deleteEvent = eventCrud.remove;

/* ---- Notes ---- */
const noteCrud = makeCrud<Note>(notesStore, noteRepo, 'note');
export type NoteDraft = Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
export async function saveNote(draft: NoteDraft): Promise<Note> {
  const now = Date.now();
  const existing = draft.id ? notesStore.get().find((n) => n.id === draft.id) : undefined;
  const note: Note = {
    id: existing?.id ?? newId(),
    title: draft.title.trim(),
    message: draft.message.trim(),
    pinned: draft.pinned,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (draft.displayStart) note.displayStart = draft.displayStart;
  if (draft.displayEnd) note.displayEnd = draft.displayEnd;
  return noteCrud.save(note);
}
export const deleteNote = noteCrud.remove;
export async function setNotePinned(id: string, pinned: boolean): Promise<void> {
  const n = notesStore.get().find((x) => x.id === id);
  if (!n) return;
  await noteCrud.save({ ...n, pinned, updatedAt: Date.now() });
}

/* ---- Reminders ---- */
const reminderCrud = makeCrud<Reminder>(remindersStore, reminderRepo, 'reminder');
export type ReminderDraft = Omit<Reminder, 'id' | 'createdAt' | 'updatedAt' | 'lastTriggeredAt'> & { id?: string };
export async function saveReminder(draft: ReminderDraft): Promise<Reminder> {
  const now = Date.now();
  const existing = draft.id ? remindersStore.get().find((r) => r.id === draft.id) : undefined;
  const previouslyShown = existing?.lastTriggeredAt ?? null;
  // Keep the trigger memory only if the EDITED rule still produces that exact occurrence. A plain
  // `date/time/repeat changed => reset` (the previous rule) also reset on edits that don't move the
  // occurrence at all - e.g. adding Weekly repeat to an already-fired Once reminder, or correcting the
  // first date of a repeating reminder - which re-showed a reminder the user had just dismissed,
  // within the grace window, the instant they saved the edit (dataService already calls tickNow()).
  // Comparing against the actual occurrence the new rule produces on that day is precise regardless of
  // which fields changed.
  const stillSameOccurrence =
    previouslyShown !== null &&
    occurrenceOnDay({ date: draft.date, time: draft.time, repeat: draft.repeat }, new Date(previouslyShown))?.getTime() === previouslyShown;
  const reminder: Reminder = {
    id: existing?.id ?? newId(),
    title: draft.title.trim(),
    message: draft.message.trim(),
    date: draft.date,
    time: draft.time,
    repeat: draft.repeat,
    enabled: draft.enabled,
    lastTriggeredAt: stillSameOccurrence ? previouslyShown : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return reminderCrud.save(reminder);
}
export const deleteReminder = async (id: string) => {
  await reminderCrud.remove(id);
  activeRemindersStore.set((list) => list.filter((a) => a.reminder.id !== id));
};
export async function setReminderEnabled(id: string, enabled: boolean): Promise<void> {
  const r = remindersStore.get().find((x) => x.id === id);
  if (!r) return;
  await reminderCrud.save({ ...r, enabled, updatedAt: Date.now() });
}
/** Records that an occurrence was shown. Store-first so the engine never double-fires even if the write is slow. */
export async function markReminderTriggered(id: string, occurrenceAt: number): Promise<void> {
  const r = remindersStore.get().find((x) => x.id === id);
  if (!r) return;
  const next = { ...r, lastTriggeredAt: occurrenceAt };
  remindersStore.set((prev) => prev.map((x) => (x.id === id ? next : x)));
  try {
    await reminderRepo.put(next);
  } catch (e) {
    console.error('[reminders] failed to persist trigger', e);
  }
}

/* ---- Schedules ---- */
const scheduleCrud = makeCrud<Schedule>(schedulesStore, scheduleRepo, 'schedule');
export type ScheduleDraft = Omit<Schedule, 'id'> & { id?: string };
export async function saveSchedule(draft: ScheduleDraft): Promise<Schedule> {
  const schedule: Schedule = {
    id: draft.id ?? newId(),
    name: draft.name.trim(),
    startTime: draft.startTime,
    endTime: draft.endTime,
    daysOfWeek: Array.from(new Set(draft.daysOfWeek)).sort((a, b) => a - b),
    mode: draft.mode,
    enabled: draft.enabled,
    priority: Math.round(draft.priority),
  };
  return scheduleCrud.save(schedule);
}
export const deleteSchedule = scheduleCrud.remove;
export async function setScheduleEnabled(id: string, enabled: boolean): Promise<void> {
  const s = schedulesStore.get().find((x) => x.id === id);
  if (!s) return;
  await scheduleCrud.save({ ...s, enabled });
}
export async function saveSchedules(list: Schedule[]): Promise<void> {
  const prev = schedulesStore.get();
  const ids = new Set(list.map((s) => s.id));
  schedulesStore.set([...prev.filter((s) => !ids.has(s.id)), ...list]);
  try {
    await scheduleRepo.putMany(list);
  } catch (e) {
    schedulesStore.set(prev);
    fail(e, 'Saving schedules');
  }
  tickNow();
}

/* ---- Household ---- */
const householdEntryCrud = makeCrud(householdEntriesStore, householdEntryRepo, 'household record');
const householdPaymentCrud = makeCrud(householdPaymentsStore, householdPaymentRepo, 'household payment');

export type HouseholdServiceDraft = Omit<HouseholdService, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
export async function saveHouseholdService(draft: HouseholdServiceDraft, settings: Omit<HouseholdServiceSettings, 'id' | 'serviceId'>): Promise<HouseholdService> {
  const now = Date.now();
  const existing = draft.id ? householdServicesStore.get().find((s) => s.id === draft.id) : undefined;
  const service: HouseholdService = { ...draft, id: existing?.id ?? newId(), name: draft.name.trim(), vendorName: draft.vendorName.trim(), notes: draft.notes.trim(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  const config: HouseholdServiceSettings = { ...settings, id: service.id, serviceId: service.id, scheduleDays: Array.from(new Set(settings.scheduleDays)).sort() };
  const prevServices = householdServicesStore.get();
  const prevSettings = householdServiceSettingsStore.get();
  householdServicesStore.set(prevServices.some((s) => s.id === service.id) ? prevServices.map((s) => s.id === service.id ? service : s) : [...prevServices, service]);
  householdServiceSettingsStore.set(prevSettings.some((s) => s.serviceId === service.id) ? prevSettings.map((s) => s.serviceId === service.id ? config : s) : [...prevSettings, config]);
  try {
    await getBackend().putMany([{ store: 'householdServices', value: service }, { store: 'householdServiceSettings', value: config }]);
  } catch (e) {
    householdServicesStore.set(prevServices); householdServiceSettingsStore.set(prevSettings); fail(e, 'Saving the household service');
  }
  tickNow();
  if (isCloudConfigured()) {
    void Promise.all([
      queueHouseholdUpsert('householdServices', service),
      queueHouseholdUpsert('householdServiceSettings', config),
    ]).catch((error) => console.error('[household] failed to queue cloud sync', error));
  }
  return service;
}
export async function deleteHouseholdService(id: string): Promise<void> {
  const entries = householdEntriesStore.get().filter((e) => e.serviceId === id);
  const payments = householdPaymentsStore.get().filter((p) => p.serviceId === id);
  const config = householdServiceSettingsStore.get().find((s) => s.serviceId === id);
  await getBackend().deleteMany([
    { store: 'householdServices', key: id }, ...entries.map((e) => ({ store: 'householdEntries' as const, key: e.id })),
    ...payments.map((p) => ({ store: 'householdPayments' as const, key: p.id })), ...(config ? [{ store: 'householdServiceSettings' as const, key: config.id }] : []),
  ]);
  householdServicesStore.set((x) => x.filter((s) => s.id !== id));
  householdEntriesStore.set((x) => x.filter((e) => e.serviceId !== id));
  householdPaymentsStore.set((x) => x.filter((p) => p.serviceId !== id));
  householdServiceSettingsStore.set((x) => x.filter((s) => s.serviceId !== id));
  if (isCloudConfigured()) {
    void Promise.all([
      queueHouseholdDelete('householdServices', id),
      ...(config ? [queueHouseholdDelete('householdServiceSettings', config.id)] : []),
      ...entries.map((entry) => queueHouseholdDelete('householdEntries', entry.id)),
      ...payments.map((payment) => queueHouseholdDelete('householdPayments', payment.id)),
    ]).catch((error) => console.error('[household] failed to queue cloud sync', error));
  }
}
export type HouseholdEntryDraft = Omit<HouseholdDailyEntry, 'id' | 'updatedAt'>;
export async function saveHouseholdEntry(draft: HouseholdEntryDraft): Promise<HouseholdDailyEntry> {
  const id = `${draft.serviceId}:${draft.date}`;
  const entry = await householdEntryCrud.save({ ...draft, id, updatedAt: Date.now() });
  if (isCloudConfigured()) void queueHouseholdUpsert('householdEntries', entry).catch((error) => console.error('[household] failed to queue cloud sync', error));
  return entry;
}
export const deleteHouseholdEntry = async (id: string): Promise<void> => {
  await householdEntryCrud.remove(id);
  if (isCloudConfigured()) void queueHouseholdDelete('householdEntries', id).catch((error) => console.error('[household] failed to queue cloud sync', error));
};
export async function saveHouseholdPayment(draft: Omit<HouseholdPayment, 'id' | 'updatedAt'>): Promise<HouseholdPayment> {
  const payment = await householdPaymentCrud.save({ ...draft, id: newId(), updatedAt: Date.now() });
  if (isCloudConfigured()) void queueHouseholdUpsert('householdPayments', payment).catch((error) => console.error('[household] failed to queue cloud sync', error));
  return payment;
}
export async function saveHouseholdPaymentReminder(service: Pick<HouseholdService, 'name'>, month: string, amount: number): Promise<Reminder> {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('Invalid household payment month.');
  const date = toDateKey(new Date(Number(match[1]), Number(match[2]), 1));
  const title = `Pay ${service.name}`;
  const existing = remindersStore.get().find((r) => r.title === title && r.date === date && r.time === '09:00');
  if (existing) return existing;
  return saveReminder({ title, message: `Household payment for ${month}: ₹${amount.toFixed(2)}`, date, time: '09:00', repeat: 'NONE', enabled: true });
}

/* ---- Settings ---- */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const prev = settingsStore.get();
  const next = { ...prev, ...patch };
  settingsStore.set(next);
  try {
    await settingsRepo.save(next);
  } catch (e) {
    settingsStore.set(prev);
    fail(e, 'Saving settings');
  }
  tickNow();
}

/* ---- Backup / restore / reset ---- */
export function buildBackup(): BackupFile {
  return createBackup({
    settings: settingsStore.get(),
    events: eventsStore.get(),
    notes: notesStore.get(),
    reminders: remindersStore.get(),
    schedules: schedulesStore.get(),
    photos: photosStore.get(),
    householdServices: householdServicesStore.get(), householdEntries: householdEntriesStore.get(), householdPayments: householdPaymentsStore.get(), householdServiceSettings: householdServiceSettingsStore.get(),
  });
}

export async function applyRestore(backup: BackupFile): Promise<void> {
  const settings: Settings = { ...backup.settings, setupComplete: true };
  try {
    await restoreContent({ settings, events: backup.events, notes: backup.notes, reminders: backup.reminders, schedules: backup.schedules, householdServices: backup.householdServices, householdEntries: backup.householdEntries, householdPayments: backup.householdPayments, householdServiceSettings: backup.householdServiceSettings });
  } catch (e) {
    fail(e, 'Restoring the backup');
  }
  settingsStore.set(settings);
  eventsStore.set(backup.events);
  notesStore.set(backup.notes);
  remindersStore.set(backup.reminders);
  schedulesStore.set(backup.schedules);
  householdServicesStore.set(backup.householdServices); householdEntriesStore.set(backup.householdEntries); householdPaymentsStore.set(backup.householdPayments); householdServiceSettingsStore.set(backup.householdServiceSettings);
  activeRemindersStore.set([]);
  tickNow();
}

/** Wipes everything (photos included) and returns the app to first-time setup. */
export async function resetFrame(): Promise<void> {
  revokeAllPhotoUrls();
  try {
    await photoRepo.clear();
    await deleteFrameDB();
  } catch (e) {
    // A reset must be all-or-nothing from the UI's point of view. If deleteFrameDB() failed here, the
    // photo stores may already be gone (photoRepo.clear() above succeeded) even though the rest of the
    // database was not deleted, leaving memory and disk inconsistent (e.g. photosStore still lists
    // photos whose blobs no longer exist). Clear every in-memory store so nothing in the UI can act on
    // data that is gone, then reload unconditionally instead of leaving a half-wiped frame running.
    console.error('[reset] delete failed, forcing a reload to recover', e);
    photosStore.set([]);
    eventsStore.set([]);
    notesStore.set([]);
    remindersStore.set([]);
    schedulesStore.set([]);
    activeRemindersStore.set([]);
    householdServicesStore.set([]);
    householdEntriesStore.set([]);
    householdPaymentsStore.set([]);
    householdServiceSettingsStore.set([]);
    window.location.reload();
  }
}
