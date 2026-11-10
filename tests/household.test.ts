import { describe, expect, it } from 'vitest';
import type { HouseholdDailyEntry, HouseholdService, HouseholdServiceSettings } from '@/types';
import { calculateHouseholdMonth, calculatePaymentSummary } from '@/household/householdLogic';
import { createBackup, validateBackup } from '@/settings/backup';
import { DEFAULT_SETTINGS } from '@/settings/settings';

const service = (patch: Partial<HouseholdService> = {}): HouseholdService => ({ id: 'maid', name: 'Maid', type: 'MAID', vendorName: '', startDate: '2026-09-01', paymentType: 'MONTHLY_FIXED', rate: 3000, status: 'ACTIVE', notes: '', createdAt: 1, updatedAt: 1, ...patch });
const config = (patch: Partial<HouseholdServiceSettings> = {}): HouseholdServiceSettings => ({ id: 'maid', serviceId: 'maid', deductionMethod: 'CALENDAR_DAYS', customDailyDeduction: 0, scheduleDays: [0,1,2,3,4,5,6], defaultQuantity: 1, unit: 'unit', ...patch });
const entry = (date: string, patch: Partial<HouseholdDailyEntry> = {}): HouseholdDailyEntry => ({ id: `maid:${date}`, serviceId: 'maid', date, note: '', updatedAt: 1, ...patch });

describe('household monthly fixed salary', () => {
  it('matches the real-life Maid scenario exactly', () => {
    const rows = [
      entry('2026-09-01', { attendance: 'PRESENT' }),
      entry('2026-09-02', { attendance: 'PRESENT' }),
      entry('2026-09-03', { attendance: 'LEAVE' }),
      entry('2026-09-04', { attendance: 'PRESENT' }),
      entry('2026-09-05', { attendance: 'PAID_LEAVE' }),
      entry('2026-09-06', { attendance: 'HALF_DAY' }),
    ];
    const result = calculateHouseholdMonth(service(), config(), rows, '2026-09');
    expect(result).toMatchObject({ amount: 2850, deduction: 150, present: 3, paidLeave: 1, halfDay: 1, leave: 1.5 });
    expect(result.lines).toEqual(expect.arrayContaining([expect.stringMatching(/1.5 unpaid day/), expect.stringMatching(/1 paid leave day/), 'Payable: ₹2850']));
  });
  it('pays the full amount with no leave and shows the calculation', () => {
    const r = calculateHouseholdMonth(service(), config(), [], '2026-09');
    expect(r.amount).toBe(3000);
    expect(r.lines.join(' ')).toMatch(/30\/30/);
  });
  it('deducts one or several unpaid leaves using calendar days', () => {
    expect(calculateHouseholdMonth(service(), config(), [entry('2026-09-05', { attendance: 'LEAVE' })], '2026-09').amount).toBe(2900);
    expect(calculateHouseholdMonth(service(), config(), [entry('2026-09-05', { attendance: 'LEAVE' }), entry('2026-09-18', { attendance: 'ABSENT' })], '2026-09').amount).toBe(2800);
  });
  it('does not deduct paid leave and deducts half for a half day', () => {
    expect(calculateHouseholdMonth(service(), config(), [entry('2026-09-05', { attendance: 'PAID_LEAVE' })], '2026-09').amount).toBe(3000);
    expect(calculateHouseholdMonth(service(), config(), [entry('2026-09-05', { attendance: 'HALF_DAY' })], '2026-09').amount).toBe(2950);
  });
  it('supports no-deduction and custom daily-deduction rules', () => {
    const leave = [entry('2026-09-05', { attendance: 'LEAVE' })];
    expect(calculateHouseholdMonth(service(), config({ deductionMethod: 'NO_DEDUCTION' }), leave, '2026-09').amount).toBe(3000);
    expect(calculateHouseholdMonth(service(), config({ deductionMethod: 'CUSTOM_DAILY', customDailyDeduction: 75 }), leave, '2026-09').amount).toBe(2925);
  });
  it('uses configured working days as the divisor', () => {
    const weekdays = config({ deductionMethod: 'WORKING_DAYS', scheduleDays: [1,2,3,4,5] });
    const noLeave = calculateHouseholdMonth(service(), weekdays, [], '2026-09');
    const oneLeave = calculateHouseholdMonth(service(), weekdays, [entry('2026-09-15', { attendance: 'LEAVE' })], '2026-09');
    expect(noLeave.amount).toBe(3000);
    expect(oneLeave.amount).toBeCloseTo(3000 - 3000 / 22, 2);
  });
  it('ignores weekends and NOT_SCHEDULED entries in working-day deductions', () => {
    const weekdays = config({ deductionMethod: 'WORKING_DAYS', scheduleDays: [1,2,3,4,5] });
    const rows = [entry('2026-09-05', { attendance: 'LEAVE' }), entry('2026-09-07', { attendance: 'NOT_SCHEDULED' }), entry('2026-09-08', { attendance: 'PAID_LEAVE' }), entry('2026-09-09', { attendance: 'HALF_DAY' })];
    const result = calculateHouseholdMonth(service({ rate: 6000 }), weekdays, rows, '2026-09');
    expect(result.leave).toBe(0.5);
    expect(result.paidLeave).toBe(1);
    expect(result.amount).toBeCloseTo(6000 - (6000 / 22) * 0.5, 2);
  });
  it('uses the configured custom deduction rather than a calendar-day rate', () => {
    const rows = [entry('2026-09-03', { attendance: 'LEAVE' }), entry('2026-09-04', { attendance: 'ABSENT' })];
    const result = calculateHouseholdMonth(service({ rate: 5000 }), config({ deductionMethod: 'CUSTOM_DAILY', customDailyDeduction: 150 }), rows, '2026-09');
    expect(result.deduction).toBe(300);
    expect(result.amount).toBe(4700);
    expect(result.lines.join(' ')).toContain('2 unpaid day(s) × ₹150');
  });
  it('honours start, stop and partial-month dates', () => {
    expect(calculateHouseholdMonth(service({ startDate: '2026-09-16' }), config(), [], '2026-09').amount).toBe(1500);
    expect(calculateHouseholdMonth(service({ startDate: '2026-09-10', endDate: '2026-09-20' }), config(), [], '2026-09').amount).toBe(1100);
    expect(calculateHouseholdMonth(service({ startDate: '2026-10-01' }), config(), [], '2026-09').amount).toBe(0);
  });
});

describe('household deliveries and changing months', () => {
  it('calculates milk per day and skips non-deliveries', () => {
    const milk = service({ id: 'milk', type: 'MILK', name: 'Milk', paymentType: 'PER_DAY', rate: 35 });
    const rows = [entry('2026-09-01', { id: 'milk:1', serviceId: 'milk', delivery: 'DELIVERED' }), entry('2026-09-02', { id: 'milk:2', serviceId: 'milk', delivery: 'NOT_DELIVERED' })];
    const r = calculateHouseholdMonth(milk, config({ id: 'milk', serviceId: 'milk' }), rows, '2026-09');
    expect(r.amount).toBe(35); expect(r.delivered).toBe(1); expect(r.skipped).toBe(1);
  });
  it('uses actual milk quantities', () => {
    const milk = service({ id: 'milk', type: 'MILK', name: 'Milk', paymentType: 'PER_UNIT', rate: 70 });
    const rows = [entry('2026-09-01', { id: 'milk:1', serviceId: 'milk', delivery: 'DELIVERED', quantity: 0.5 }), entry('2026-09-02', { id: 'milk:2', serviceId: 'milk', delivery: 'DELIVERED', quantity: 1 })];
    expect(calculateHouseholdMonth(milk, config({ id: 'milk', serviceId: 'milk', defaultQuantity: 0.5, unit: 'litre' }), rows, '2026-09').amount).toBe(105);
  });
  it('matches the real-life milk scenario and excludes dates before start', () => {
    const milk = service({ id: 'milk', type: 'MILK', name: 'Milk Vendor', startDate: '2026-09-05', paymentType: 'PER_UNIT', rate: 70 });
    const rows = [
      entry('2026-09-04', { id: 'pre', serviceId: 'milk', delivery: 'DELIVERED', quantity: 2 }),
      entry('2026-09-05', { id: 'm5', serviceId: 'milk', delivery: 'DELIVERED', quantity: 0.5 }),
      entry('2026-09-06', { id: 'm6', serviceId: 'milk', delivery: 'DELIVERED', quantity: 0.5 }),
      entry('2026-09-07', { id: 'm7', serviceId: 'milk', delivery: 'NOT_DELIVERED' }),
      entry('2026-09-08', { id: 'm8', serviceId: 'milk', delivery: 'DELIVERED', quantity: 1 }),
      entry('2026-09-09', { id: 'm9', serviceId: 'milk', delivery: 'DELIVERED', quantity: 0.5 }),
    ];
    const result = calculateHouseholdMonth(milk, config({ id: 'milk', serviceId: 'milk', defaultQuantity: 0.5, unit: 'litre' }), rows, '2026-09');
    expect(result).toMatchObject({ delivered: 4, skipped: 1, quantity: 2.5, amount: 175 });
  });
  it('calculates per delivery and manual vegetable amounts', () => {
    const water = service({ id: 'water', type: 'WATER_CAN', paymentType: 'PER_DELIVERY', rate: 50 });
    const deliveries = [entry('2026-09-01', { id: 'water:1', serviceId: 'water', delivery: 'DELIVERED' }), entry('2026-09-02', { id: 'water:2', serviceId: 'water', delivery: 'DELIVERED' })];
    expect(calculateHouseholdMonth(water, config({ id: 'water', serviceId: 'water' }), deliveries, '2026-09').amount).toBe(100);
    const veg = service({ id: 'veg', type: 'VEGETABLES', paymentType: 'CUSTOM', rate: 0 });
    const amounts = [entry('2026-09-10', { id: 'veg:1', serviceId: 'veg', amount: 120 }), entry('2026-09-12', { id: 'veg:2', serviceId: 'veg', amount: 85 })];
    expect(calculateHouseholdMonth(veg, config({ id: 'veg', serviceId: 'veg' }), amounts, '2026-09').amount).toBe(205);
  });
  it('separates month and year records', () => {
    const milk = service({ id: 'milk', type: 'MILK', paymentType: 'PER_DAY', rate: 35, startDate: '2026-01-01' });
    const rows = [entry('2026-09-01', { id: 'a', serviceId: 'milk', delivery: 'DELIVERED' }), entry('2026-10-01', { id: 'b', serviceId: 'milk', delivery: 'DELIVERED' }), entry('2027-09-01', { id: 'c', serviceId: 'milk', delivery: 'DELIVERED' })];
    expect(calculateHouseholdMonth(milk, config({ id: 'milk', serviceId: 'milk' }), rows, '2026-09').amount).toBe(35);
  });
});

describe('household payment ledger and scale', () => {
  it('retains partial and final payment records and derives the remaining balance', () => {
    const first = { id: 'p1', serviceId: 'maid', month: '2026-09', expectedAmount: 2850, status: 'PARTIALLY_PAID' as const, paidAmount: 1000, paymentDate: '2026-10-01', note: '', updatedAt: 1 };
    expect(calculatePaymentSummary(2850, [first])).toEqual({ paid: 1000, remaining: 1850, status: 'PARTIALLY_PAID' });
    const final = { ...first, id: 'p2', status: 'PAID' as const, paidAmount: 1850, paymentDate: '2026-10-02' };
    expect(calculatePaymentSummary(2850, [first, final])).toEqual({ paid: 2850, remaining: 0, status: 'PAID' });
  });
  it('calculates 20 services with a month of records independently', () => {
    const services = Array.from({ length: 20 }, (_, i) => service({ id: `s${i}`, name: `Service ${i}`, type: 'MILK', paymentType: 'PER_DAY', rate: 10 }));
    const entries = services.flatMap((s) => Array.from({ length: 30 }, (_, i) => entry(`2026-09-${String(i + 1).padStart(2, '0')}`, { id: `${s.id}:${i}`, serviceId: s.id, delivery: 'DELIVERED' })));
    const started = performance.now();
    const results = services.map((s) => calculateHouseholdMonth(s, config({ id: s.id, serviceId: s.id }), entries, '2026-09'));
    const elapsed = performance.now() - started;
    expect(results).toHaveLength(20);
    expect(results.every((result) => result.amount === 300)).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('household backup', () => {
  it('round-trips household records and payment status', () => {
    const s = service(); const c = config(); const e = entry('2026-09-05', { attendance: 'LEAVE' });
    const backup = createBackup({ settings: DEFAULT_SETTINGS, events: [], notes: [], reminders: [], schedules: [], photos: [], householdServices: [s], householdEntries: [e], householdServiceSettings: [c], householdPayments: [{ id: 'maid:2026-09', serviceId: 'maid', month: '2026-09', expectedAmount: 2900, status: 'PARTIALLY_PAID', paidAmount: 1000, paymentDate: '2026-10-01', note: '', updatedAt: 1 }] });
    const result = validateBackup(JSON.parse(JSON.stringify(backup)));
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.backup.householdEntries).toEqual([e]); expect(result.backup.householdPayments[0]?.status).toBe('PARTIALLY_PAID'); }
  });
  it('safely upgrades an old backup with no household fields', () => {
    const backup = createBackup({ settings: DEFAULT_SETTINGS, events: [], notes: [], reminders: [], schedules: [], photos: [] });
    const old = { ...backup, version: 1 }; delete (old as Partial<typeof old>).householdServices; delete (old as Partial<typeof old>).householdEntries; delete (old as Partial<typeof old>).householdPayments; delete (old as Partial<typeof old>).householdServiceSettings;
    const result = validateBackup(old);
    expect(result.ok && result.backup.householdServices).toEqual([]);
  });
});
