/** Shared domain types for the Smart Family Frame. Keep this file free of UI concerns. */

export type FrameModeKind = 'PHOTOS' | 'CLOCK' | 'CALENDAR' | 'NOTES' | 'DASHBOARD' | 'NIGHT';
export const FRAME_MODES: FrameModeKind[] = ['PHOTOS', 'CLOCK', 'CALENDAR', 'NOTES', 'DASHBOARD', 'NIGHT'];

export type TransitionStyle = 'fade' | 'crossfade' | 'none';
export type ClockFormat = '12h' | '24h';
export type ClockStyle = 'digital' | 'minimal';
export type NightModeType = 'black' | 'clock';
export type SlideshowSource = 'all' | 'favorites';

export interface Settings {
  version: number;
  frameName: string;
  setupComplete: boolean;
  defaultMode: FrameModeKind;
  photoIntervalSec: number;
  shuffle: boolean;
  loop: boolean;
  slideshowSource: SlideshowSource;
  transition: TransitionStyle;
  transitionMs: number;
  blurBackground: boolean;
  showClockOnPhotos: boolean;
  clockFormat: ClockFormat;
  clockStyle: ClockStyle;
  showSeconds: boolean;
  showDate: boolean;
  nightModeType: NightModeType;
  showHouseholdOnFrame: boolean;
}

export interface PhotoMeta {
  id: string;
  filename: string;
  mimeType: string;
  createdAt: number;
  favorite: boolean;
  size: number;
  width?: number;
  height?: number;
}

/** Dates are local calendar dates as YYYY-MM-DD; times are HH:MM (24h). */
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  description: string;
  allDay: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  title: string;
  message: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  /** YYYY-MM-DD, inclusive. Note is shown on the frame only within the window (if set). */
  displayStart?: string;
  displayEnd?: string;
}

export type RepeatRule = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export const REPEAT_RULES: RepeatRule[] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

export interface Reminder {
  id: string;
  title: string;
  message: string;
  date: string;
  time: string;
  repeat: RepeatRule;
  enabled: boolean;
  /** Timestamp of the occurrence that was last shown (not the wall-clock time it was shown). */
  lastTriggeredAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Schedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  /** 0 = Sunday ... 6 = Saturday */
  daysOfWeek: number[];
  mode: FrameModeKind;
  enabled: boolean;
  /** Higher wins when schedules overlap. */
  priority: number;
}

export interface ActiveReminder {
  reminder: Reminder;
  occurrenceAt: number;
  shownAt: number;
}

export const HOUSEHOLD_SERVICE_TYPES = ['MAID', 'COOK', 'DRIVER', 'MILK', 'NEWSPAPER', 'VEGETABLES', 'WATER_CAN', 'CAR_WASH', 'LAUNDRY', 'CUSTOM'] as const;
export type HouseholdServiceType = (typeof HOUSEHOLD_SERVICE_TYPES)[number];
export type HouseholdPaymentType = 'MONTHLY_FIXED' | 'PER_DAY' | 'PER_DELIVERY' | 'PER_UNIT' | 'CUSTOM';
export type HouseholdServiceStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED';
export type HouseholdAttendance = 'PRESENT' | 'LEAVE' | 'PAID_LEAVE' | 'ABSENT' | 'HALF_DAY' | 'NOT_SCHEDULED';
export type HouseholdDeliveryStatus = 'DELIVERED' | 'NOT_DELIVERED';
export type HouseholdDeductionMethod = 'NO_DEDUCTION' | 'CALENDAR_DAYS' | 'WORKING_DAYS' | 'CUSTOM_DAILY';
export type HouseholdPaymentStatus = 'UNPAID' | 'PAID' | 'PARTIALLY_PAID';

export interface HouseholdService {
  id: string;
  name: string;
  type: HouseholdServiceType;
  vendorName: string;
  startDate: string;
  endDate?: string;
  paymentType: HouseholdPaymentType;
  rate: number;
  status: HouseholdServiceStatus;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface HouseholdDailyEntry {
  id: string;
  serviceId: string;
  date: string;
  attendance?: HouseholdAttendance;
  delivery?: HouseholdDeliveryStatus;
  quantity?: number;
  amount?: number;
  note: string;
  updatedAt: number;
}

export interface HouseholdPayment {
  id: string;
  serviceId: string;
  month: string;
  expectedAmount: number;
  status: HouseholdPaymentStatus;
  paidAmount: number;
  paymentDate?: string;
  note: string;
  updatedAt: number;
}

export interface HouseholdServiceSettings {
  id: string;
  serviceId: string;
  deductionMethod: HouseholdDeductionMethod;
  customDailyDeduction: number;
  scheduleDays: number[];
  defaultQuantity: number;
  unit: string;
}

export type StorageKind = 'indexeddb' | 'memory';

export interface AppStatus {
  ready: boolean;
  storage: StorageKind;
  storageError?: string;
  /** Result of navigator.storage.persist(): true = durable, false = best-effort (evictable), null = unknown. */
  persisted: boolean | null;
}
