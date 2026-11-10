import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { findDueReminders } from '@/reminders/reminderLogic';

const backendMod = await import('@/storage/backend');
const stores = await import('@/app/stores');
const svc = await import('@/services/dataService');

describe('data services keep memory and IndexedDB in sync', () => {
  beforeAll(async () => {
    await backendMod.initBackend();
  });

  it('event create / update / delete round-trip through the store and the database', async () => {
    const e = await svc.saveEvent({ title: '  Doctor ', date: '2026-09-15', allDay: false, startTime: '16:00', endTime: '', description: ' x ' });
    expect(e.title).toBe('Doctor');
    expect(e.endTime).toBeUndefined();
    expect(stores.eventsStore.get()).toHaveLength(1);
    const repos = await import('@/storage/repositories');
    expect((await repos.eventRepo.get(e.id))?.title).toBe('Doctor');
    const upd = await svc.saveEvent({ id: e.id, title: 'Dentist', date: '2026-09-16', allDay: true, description: '' });
    expect(upd.id).toBe(e.id);
    expect(upd.startTime).toBeUndefined();
    expect(upd.createdAt).toBe(e.createdAt);
    expect(stores.eventsStore.get()[0]?.title).toBe('Dentist');
    await svc.deleteEvent(e.id);
    expect(stores.eventsStore.get()).toHaveLength(0);
    expect(await repos.eventRepo.get(e.id)).toBeUndefined();
  });

  it('a failed write rolls the store back and surfaces a toast instead of throwing into the UI unhandled', async () => {
    const backend = backendMod.getBackend();
    const original = backend.put;
    backend.put = () => Promise.reject(new DOMException('quota', 'QuotaExceededError'));
    const before = stores.notesStore.get();
    await expect(svc.saveNote({ title: 'x', message: 'y', pinned: true })).rejects.toThrow(/out of storage space/);
    // Content equality, not reference identity: the rollback now targets only the failed item via a
    // functional update (so concurrent writes to other items are never discarded), which legitimately
    // produces a new array instance even when it ends up holding the same items as before.
    expect(stores.notesStore.get()).toEqual(before);
    expect(stores.toastStore.get().some((t) => t.kind === 'error')).toBe(true);
    backend.put = original;
    await svc.saveNote({ title: 'ok', message: '', pinned: true });
    expect(stores.notesStore.get()).toHaveLength(1);
  });

  it('a failed write to one item does not roll back a concurrent successful write to a different item', async () => {
    const a = await svc.saveEvent({ title: 'A', date: '2026-09-15', allDay: true, description: '' });
    const backend = backendMod.getBackend();
    const original = backend.put.bind(backend);
    let resolveA: (() => void) | undefined;
    const aPutGate = new Promise<void>((resolve) => { resolveA = resolve; });
    // Make the write for B hang, then fail, while a concurrent write for A (issued afterwards, on the
    // healthy path) is allowed to complete first - simulating the store-first reminder-trigger pattern
    // where a slow/failing write for one entity overlaps a fast successful write for another.
    let putCalls = 0;
    backend.put = (store, value) => {
      putCalls++;
      if (putCalls === 1) {
        return aPutGate.then(() => Promise.reject(new DOMException('boom', 'UnknownError')));
      }
      return original(store, value);
    };
    const bSave = svc.saveEvent({ id: a.id, title: 'B (will fail)', date: '2026-09-15', allDay: true, description: '' });
    await svc.saveEvent({ title: 'C (independent, succeeds)', date: '2026-09-16', allDay: true, description: '' });
    resolveA?.();
    await expect(bSave).rejects.toThrow();
    backend.put = original;
    const titles = stores.eventsStore.get().map((e) => e.title).sort();
    expect(titles).toEqual(['A', 'C (independent, succeeds)']); // B's failure rolled back only B/A's slot, C survived
    await svc.deleteEvent(a.id);
    const cId = stores.eventsStore.get().find((e) => e.title.startsWith('C'))?.id;
    if (cId) await svc.deleteEvent(cId);
  });

  it('editing a reminder time resets its trigger memory; toggling enabled keeps it', async () => {
    const r = await svc.saveReminder({ title: 'Call', message: '', date: '2026-09-15', time: '19:00', repeat: 'DAILY', enabled: true });
    await svc.markReminderTriggered(r.id, 123);
    expect(stores.remindersStore.get()[0]?.lastTriggeredAt).toBe(123);
    await svc.setReminderEnabled(r.id, false);
    expect(stores.remindersStore.get()[0]?.lastTriggeredAt).toBe(123);
    await svc.saveReminder({ id: r.id, title: 'Call', message: '', date: '2026-09-15', time: '19:30', repeat: 'DAILY', enabled: true });
    expect(stores.remindersStore.get()[0]?.lastTriggeredAt).toBeNull();
    stores.activeRemindersStore.set([{ reminder: stores.remindersStore.get()[0]!, occurrenceAt: 1, shownAt: 1 }]);
    await svc.deleteReminder(r.id);
    expect(stores.activeRemindersStore.get()).toHaveLength(0);
    expect(stores.remindersStore.get()).toHaveLength(0);
  });

  it('schedules are saved with de-duplicated sorted days and rounded priority', async () => {
    const s = await svc.saveSchedule({ name: 'S', startTime: '23:00', endTime: '06:30', daysOfWeek: [6, 0, 6, 3], mode: 'NIGHT', enabled: true, priority: 2.6 });
    expect(s.daysOfWeek).toEqual([0, 3, 6]);
    expect(s.priority).toBe(3);
    await svc.setScheduleEnabled(s.id, false);
    expect(stores.schedulesStore.get()[0]?.enabled).toBe(false);
  });

  it('backup -> restore round trip forces setupComplete and clears active overlays', async () => {
    await svc.updateSettings({ frameName: 'Before', setupComplete: true });
    const backup = svc.buildBackup();
    expect(backup.settings.frameName).toBe('Before');
    await svc.updateSettings({ frameName: 'Changed' });
    await svc.applyRestore({ ...backup, settings: { ...backup.settings, setupComplete: false } });
    expect(stores.settingsStore.get().frameName).toBe('Before');
    expect(stores.settingsStore.get().setupComplete).toBe(true);
    expect(stores.activeRemindersStore.get()).toHaveLength(0);
  });

  it('backup -> restore round trips household services, entries, settings and payments', async () => {
    const service = await svc.saveHouseholdService(
      { name: 'Milk', type: 'MILK', vendorName: 'Vendor', startDate: '2026-09-01', paymentType: 'PER_UNIT', rate: 70, status: 'ACTIVE', notes: '' },
      { deductionMethod: 'NO_DEDUCTION', customDailyDeduction: 0, scheduleDays: [0,1,2,3,4,5,6], defaultQuantity: 0.5, unit: 'litre' },
    );
    await svc.saveHouseholdEntry({ serviceId: service.id, date: '2026-09-15', delivery: 'DELIVERED', quantity: 0.5, note: '' });
    await svc.saveHouseholdPayment({ serviceId: service.id, month: '2026-09', expectedAmount: 35, status: 'PAID', paidAmount: 35, paymentDate: '2026-10-01', note: '' });
    const backup = svc.buildBackup();
    await svc.deleteHouseholdService(service.id);
    expect(stores.householdServicesStore.get()).toHaveLength(0);
    await svc.applyRestore(backup);
    expect(stores.householdServicesStore.get()[0]?.name).toBe('Milk');
    expect(stores.householdEntriesStore.get()[0]?.quantity).toBe(0.5);
    expect(stores.householdServiceSettingsStore.get()[0]?.unit).toBe('litre');
    expect(stores.householdPaymentsStore.get()[0]?.status).toBe('PAID');
  });

  it('clears only one daily entry and keeps the service and other dates', async () => {
    const service = stores.householdServicesStore.get()[0]!;
    const first = await svc.saveHouseholdEntry({ serviceId: service.id, date: '2026-09-20', attendance: 'LEAVE', note: '' });
    await svc.saveHouseholdEntry({ serviceId: service.id, date: '2026-09-21', attendance: 'PRESENT', note: '' });
    await svc.deleteHouseholdEntry(first.id);
    expect(stores.householdServicesStore.get().some((s) => s.id === service.id)).toBe(true);
    expect(stores.householdEntriesStore.get().some((e) => e.date === '2026-09-20')).toBe(false);
    expect(stores.householdEntriesStore.get().some((e) => e.date === '2026-09-21')).toBe(true);
  });

  it('stores partial and final payments as separate history records', async () => {
    const service = stores.householdServicesStore.get()[0]!;
    await svc.saveHouseholdPayment({ serviceId: service.id, month: '2026-10', expectedAmount: 100, status: 'PARTIALLY_PAID', paidAmount: 40, paymentDate: '2026-11-01', note: '' });
    await svc.saveHouseholdPayment({ serviceId: service.id, month: '2026-10', expectedAmount: 100, status: 'PAID', paidAmount: 60, paymentDate: '2026-11-02', note: '' });
    const history = stores.householdPaymentsStore.get().filter((p) => p.serviceId === service.id && p.month === '2026-10');
    expect(history).toHaveLength(2);
    expect(new Set(history.map((p) => p.id)).size).toBe(2);
  });

  it('creates household payment reminders in the normal reminder store without duplicates', async () => {
    const before = stores.remindersStore.get().length;
    const maid = await svc.saveHouseholdPaymentReminder({ name: 'Maid' }, '2026-09', 2850);
    const milk = await svc.saveHouseholdPaymentReminder({ name: 'Milk Vendor' }, '2026-09', 175);
    const duplicate = await svc.saveHouseholdPaymentReminder({ name: 'Maid' }, '2026-09', 2850);
    expect(maid).toMatchObject({ title: 'Pay Maid', date: '2026-10-01', time: '09:00', repeat: 'NONE', enabled: true });
    expect(milk.title).toBe('Pay Milk Vendor');
    expect(duplicate.id).toBe(maid.id);
    expect(stores.remindersStore.get()).toHaveLength(before + 2);
    expect(findDueReminders([maid], new Date(2026, 9, 1, 9, 0))).toHaveLength(1);
  });
});
