import { createStore } from './store';
import type { Settings, PhotoMeta, CalendarEvent, Note, Reminder, Schedule, AppStatus, ActiveReminder, HouseholdService, HouseholdDailyEntry, HouseholdPayment, HouseholdServiceSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/settings/settings';

export type Screen = 'loading' | 'setup' | 'manage' | 'frame';
export type Tab = 'frame' | 'photos' | 'calendar' | 'notes' | 'reminders' | 'household' | 'schedule' | 'settings';

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);
export const photosStore = createStore<PhotoMeta[]>([]);
export const eventsStore = createStore<CalendarEvent[]>([]);
export const notesStore = createStore<Note[]>([]);
export const remindersStore = createStore<Reminder[]>([]);
export const schedulesStore = createStore<Schedule[]>([]);
export const householdServicesStore = createStore<HouseholdService[]>([]);
export const householdEntriesStore = createStore<HouseholdDailyEntry[]>([]);
export const householdPaymentsStore = createStore<HouseholdPayment[]>([]);
export const householdServiceSettingsStore = createStore<HouseholdServiceSettings[]>([]);
export const statusStore = createStore<AppStatus>({ ready: false, storage: 'indexeddb', persisted: null });

export type CloudStatus = 'not_configured' | 'not_paired' | 'connecting' | 'connected' | 'offline' | 'error';
export interface RemoteSharingMember {
  uid: string;
  displayName: string;
  role: 'OWNER' | 'MEMBER';
  status: 'ACTIVE' | 'REVOKED';
}
export interface RemoteSharingState {
  status: CloudStatus;
  frameId: string | null;
  familyId: string | null;
  familyName: string | null;
  lastSyncAt: number | null;
  pendingCount: number;
  errorMessage: string | null;
  members: RemoteSharingMember[];
}
export const remoteSharingStore = createStore<RemoteSharingState>({
  status: 'not_configured',
  frameId: null,
  familyId: null,
  familyName: null,
  lastSyncAt: null,
  pendingCount: 0,
  errorMessage: null,
  members: [],
});
export const viewStore = createStore<{ screen: Screen; tab: Tab }>({ screen: 'loading', tab: 'frame' });
export const activeRemindersStore = createStore<ActiveReminder[]>([]);

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}
export const toastStore = createStore<Toast[]>([]);
let toastSeq = 0;
export function toast(message: string, kind: Toast['kind'] = 'info', ttlMs = 4500): void {
  const id = ++toastSeq;
  toastStore.set((list) => [...list, { id, kind, message }]);
  setTimeout(() => toastStore.set((list) => list.filter((t) => t.id !== id)), ttlMs);
}
export function dismissToast(id: number): void {
  toastStore.set((list) => list.filter((t) => t.id !== id));
}

export function navigate(tab: Tab): void {
  viewStore.set({ screen: 'manage', tab });
}
export function setScreen(screen: Screen): void {
  viewStore.set((v) => ({ ...v, screen }));
}
