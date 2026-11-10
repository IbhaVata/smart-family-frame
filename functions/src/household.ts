/**
 * Read-only household summary for the Family PWA, computed with the SAME shared calculation engine the
 * Frame uses locally (shared/household/calculations.ts — never re-implemented here, V2 build §42).
 * Enforces §43's privacy rule at the FIELD level (not just per-document): a plain MEMBER gets attendance
 * counts only; amounts, deductions and payment records are OWNER-only, stripped here server-side rather
 * than relying on the client to hide them.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/admin.js';
import { requireUid, requireActiveMember, requireFrame } from './lib/auth.js';
import { calculateHouseholdMonth, calculatePaymentSummary } from './shared/household/calculations.js';
import type { HouseholdService, HouseholdDailyEntry, HouseholdPayment, HouseholdServiceSettings } from './shared/types.js';

export const getHouseholdSummary = onCall<{ frameId: string; month: string }>(async (request) => {
  const uid = requireUid(request);
  const frameId = String(request.data?.frameId ?? '');
  const month = String(request.data?.month ?? '');
  if (!frameId || !/^\d{4}-\d{2}$/.test(month)) throw new HttpsError('invalid-argument', 'frameId and a YYYY-MM month are required.');
  const frame = await requireFrame(frameId);
  if (!frame.familyId) throw new HttpsError('failed-precondition', 'This Frame is not connected to a family.');
  const member = await requireActiveMember(frame.familyId, uid);
  const isOwner = member.role === 'OWNER';

  const [servicesSnap, settingsSnap, entriesSnap] = await Promise.all([
    db.collection(`frames/${frameId}/householdServices`).get(),
    db.collection(`frames/${frameId}/householdServiceSettings`).get(),
    db.collection(`frames/${frameId}/householdEntries`).where('date', '>=', `${month}-01`).where('date', '<=', `${month}-31`).get(),
  ]);
  const services = servicesSnap.docs.map((d) => d.data() as HouseholdService).filter((s) => s.status === 'ACTIVE');
  const settingsByService = new Map(settingsSnap.docs.map((d) => [(d.data() as HouseholdServiceSettings).serviceId, d.data() as HouseholdServiceSettings]));
  const entries = entriesSnap.docs.map((d) => d.data() as HouseholdDailyEntry);

  let payments: HouseholdPayment[] = [];
  if (isOwner) {
    const paymentsSnap = await db.collection(`frames/${frameId}/householdPayments`).where('month', '==', month).get();
    payments = paymentsSnap.docs.map((d) => d.data() as HouseholdPayment);
  }

  const summary = services.map((service) => {
    const settings = settingsByService.get(service.id) ?? { id: service.id, serviceId: service.id, deductionMethod: 'NO_DEDUCTION' as const, customDailyDeduction: 0, scheduleDays: [], defaultQuantity: 1, unit: '' };
    const calc = calculateHouseholdMonth(service, settings, entries, month);
    const base = {
      serviceId: service.id,
      serviceName: service.name,
      type: service.type,
      present: calc.present,
      leave: calc.leave,
      paidLeave: calc.paidLeave,
      halfDay: calc.halfDay,
      delivered: calc.delivered,
      skipped: calc.skipped,
      quantity: calc.quantity,
      eligibleDays: calc.eligibleDays,
    };
    if (!isOwner) return base;
    const servicePayments = payments.filter((p) => p.serviceId === service.id);
    return { ...base, amount: calc.amount, deduction: calc.deduction, dailyRate: calc.dailyRate, lines: calc.lines, payment: calculatePaymentSummary(calc.amount, servicePayments) };
  });

  return { month, isOwner, services: summary };
});
