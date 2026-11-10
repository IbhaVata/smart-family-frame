/**
 * Canonical household calculation engine. Moved here from src/household/householdLogic.ts (V1) so V2
 * consumers (the Family PWA's household summary, and the `getHouseholdSummary` Cloud Function) reuse
 * EXACTLY these formulas instead of re-implementing them — see V2 build instructions §42 ("Do NOT
 * duplicate calculation formulas in cloud or mobile"). src/household/householdLogic.ts now re-exports
 * this module verbatim; its public API (function names, signatures, behavior) is unchanged, so every
 * existing V1 caller and test keeps working without modification.
 *
 * Pure, dependency-free (only shared/types + shared/time) — safe to import from a browser bundle or a
 * Node Cloud Function.
 */
import type { HouseholdDailyEntry, HouseholdPayment, HouseholdPaymentStatus, HouseholdService, HouseholdServiceSettings } from '../types.js';
import { addDays, parseDateKey, toDateKey } from '../time.js';

export interface HouseholdCalculation {
  amount: number;
  deduction: number;
  dailyRate: number;
  eligibleDays: number;
  lines: string[];
  present: number;
  leave: number;
  paidLeave: number;
  halfDay: number;
  delivered: number;
  skipped: number;
  quantity: number;
}

export const STAFF_TYPES = ['MAID', 'COOK', 'DRIVER', 'CAR_WASH'] as const;
export function isStaffService(s: HouseholdService): boolean {
  return (STAFF_TYPES as readonly string[]).includes(s.type) || (s.type === 'CUSTOM' && s.paymentType === 'MONTHLY_FIXED');
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(month: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
}

export function activeDates(service: HouseholdService, settings: HouseholdServiceSettings, month: string): string[] {
  const bounds = monthBounds(month);
  const serviceStart = parseDateKey(service.startDate);
  const serviceEnd = service.endDate ? parseDateKey(service.endDate) : null;
  if (!bounds || !serviceStart) return [];
  const start = serviceStart > bounds.start ? serviceStart : bounds.start;
  const end = serviceEnd && serviceEnd < bounds.end ? serviceEnd : bounds.end;
  if (start > end) return [];
  const result: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (settings.scheduleDays.length === 0 || settings.scheduleDays.includes(d.getDay())) result.push(toDateKey(d));
  }
  return result;
}

const money = (n: number) => `₹${n.toFixed(2).replace(/\.00$/, '')}`;
const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Calculates one service/month and returns a human-readable audit trail. */
export function calculateHouseholdMonth(service: HouseholdService, settings: HouseholdServiceSettings, allEntries: HouseholdDailyEntry[], month: string): HouseholdCalculation {
  const dates = activeDates(service, settings, month);
  const eligible = new Set(dates);
  const entries = allEntries.filter((e) => e.serviceId === service.id && e.date.startsWith(`${month}-`) && eligible.has(e.date));
  const present = entries.filter((e) => e.attendance === 'PRESENT').length;
  const paidLeave = entries.filter((e) => e.attendance === 'PAID_LEAVE').length;
  const halfDay = entries.filter((e) => e.attendance === 'HALF_DAY').length;
  const unpaid = entries.reduce((n, e) => n + (e.attendance === 'HALF_DAY' ? 0.5 : e.attendance === 'LEAVE' || e.attendance === 'ABSENT' ? 1 : 0), 0);
  const deliveredEntries = entries.filter((e) => e.delivery === 'DELIVERED');
  const delivered = deliveredEntries.length;
  const skipped = entries.filter((e) => e.delivery === 'NOT_DELIVERED').length;
  const quantity = deliveredEntries.reduce((n, e) => n + (e.quantity ?? settings.defaultQuantity ?? 1), 0);
  const result = { amount: 0, deduction: 0, dailyRate: 0, eligibleDays: dates.length, lines: [] as string[], present, leave: unpaid, paidLeave, halfDay, delivered, skipped, quantity };
  if (dates.length === 0) return { ...result, lines: ['Service was not active in this month.'] };

  if (service.paymentType === 'MONTHLY_FIXED') {
    const bounds = monthBounds(month)!;
    const fullMonthDays = bounds.end.getDate();
    const fullWorkingDays = Array.from({ length: fullMonthDays }, (_, i) => new Date(bounds.start.getFullYear(), bounds.start.getMonth(), i + 1))
      .filter((d) => settings.scheduleDays.length === 0 || settings.scheduleDays.includes(d.getDay())).length;
    const divisor = settings.deductionMethod === 'WORKING_DAYS' ? fullWorkingDays : fullMonthDays;
    const base = service.rate * (dates.length / Math.max(1, divisor));
    result.lines.push(`Monthly rate ${money(service.rate)} × ${dates.length}/${divisor} active ${settings.deductionMethod === 'WORKING_DAYS' ? 'working' : 'calendar'} days = ${money(base)}`);
    let deduction = 0;
    if (settings.deductionMethod === 'NO_DEDUCTION') {
      result.lines.push('Leave deduction: none');
    } else {
      const daily = settings.deductionMethod === 'CUSTOM_DAILY' ? settings.customDailyDeduction : service.rate / Math.max(1, divisor);
      deduction = daily * unpaid;
      result.dailyRate = roundMoney(daily);
      result.lines.push(`${unpaid} unpaid day(s) × ${money(daily)} = ${money(deduction)} deduction`);
      if (paidLeave) result.lines.push(`${paidLeave} paid leave day(s): no deduction`);
    }
    result.amount = roundMoney(Math.max(0, base - deduction));
    result.deduction = roundMoney(deduction);
  } else if (service.paymentType === 'PER_UNIT') {
    result.amount = roundMoney(deliveredEntries.reduce((n, e) => n + (e.amount ?? (e.quantity ?? settings.defaultQuantity) * service.rate), 0));
    result.lines.push(`${quantity} ${settings.unit || 'unit'} × ${money(service.rate)} (individual amounts override) = ${money(result.amount)}`);
  } else if (service.paymentType === 'CUSTOM') {
    result.amount = roundMoney(entries.reduce((n, e) => n + (e.amount ?? 0), 0));
    result.lines.push(`${entries.filter((e) => e.amount !== undefined).length} entered amount(s) = ${money(result.amount)}`);
  } else {
    const counted = service.paymentType === 'PER_DELIVERY' ? deliveredEntries : entries.filter((e) => e.delivery === 'DELIVERED' || e.attendance === 'PRESENT' || e.attendance === 'PAID_LEAVE' || e.attendance === 'HALF_DAY');
    result.amount = roundMoney(counted.reduce((n, e) => n + (e.amount ?? service.rate * (e.attendance === 'HALF_DAY' ? 0.5 : 1)), 0));
    result.lines.push(`${counted.length} recorded ${service.paymentType === 'PER_DELIVERY' ? 'delivery' : 'day'} entry/entries × ${money(service.rate)} (individual amounts override) = ${money(result.amount)}`);
  }
  result.lines.push(`Payable: ${money(result.amount)}`);
  return result;
}

export function validateHouseholdService(service: Pick<HouseholdService, 'name' | 'startDate' | 'endDate' | 'rate'>): string[] {
  const errors: string[] = [];
  if (!service.name.trim()) errors.push('Give the service a name.');
  const start = parseDateKey(service.startDate);
  if (!start) errors.push('Pick a valid start date.');
  const end = service.endDate ? parseDateKey(service.endDate) : null;
  if (service.endDate && !end) errors.push('Pick a valid end date.');
  if (start && end && end < start) errors.push('End date must be after the start date.');
  if (!Number.isFinite(service.rate) || service.rate < 0) errors.push('Rate must be zero or more.');
  return errors;
}

export function calculatePaymentSummary(expectedAmount: number, payments: HouseholdPayment[]): { paid: number; remaining: number; status: HouseholdPaymentStatus } {
  const paid = roundMoney(payments.reduce((sum, payment) => sum + Math.max(0, payment.paidAmount), 0));
  const remaining = roundMoney(Math.max(0, expectedAmount - paid));
  const status: HouseholdPaymentStatus = paid <= 0 ? 'UNPAID' : remaining <= 0 ? 'PAID' : 'PARTIALLY_PAID';
  return { paid, remaining, status };
}
