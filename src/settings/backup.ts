import type { Settings, CalendarEvent, Note, Reminder, Schedule, PhotoMeta, RepeatRule, HouseholdService, HouseholdDailyEntry, HouseholdPayment, HouseholdServiceSettings } from '@/types';
import { FRAME_MODES, REPEAT_RULES } from '@/types';
import { normalizeSettings } from './settings';
import { isValidDateKey, HHMM_RE } from '@/utils/time';

export const BACKUP_FORMAT = 'smart-family-frame-backup';
export const BACKUP_VERSION = 2;

/**
 * V1 backup contains configuration and content, plus PHOTO METADATA ONLY.
 * Photo binaries (the image files themselves) are NOT included; see README.
 */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  frameName: string;
  includesPhotoBinaries: false;
  settings: Settings;
  events: CalendarEvent[];
  notes: Note[];
  reminders: Reminder[];
  schedules: Schedule[];
  photos: PhotoMeta[];
  householdServices: HouseholdService[];
  householdEntries: HouseholdDailyEntry[];
  householdPayments: HouseholdPayment[];
  householdServiceSettings: HouseholdServiceSettings[];
}

export interface BackupSource {
  settings: Settings;
  events: CalendarEvent[];
  notes: Note[];
  reminders: Reminder[];
  schedules: Schedule[];
  photos: PhotoMeta[];
  householdServices?: HouseholdService[];
  householdEntries?: HouseholdDailyEntry[];
  householdPayments?: HouseholdPayment[];
  householdServiceSettings?: HouseholdServiceSettings[];
}

export function createBackup(src: BackupSource, now: Date = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    frameName: src.settings.frameName,
    includesPhotoBinaries: false,
    settings: src.settings,
    events: src.events,
    notes: src.notes,
    reminders: src.reminders,
    schedules: src.schedules,
    photos: src.photos,
    householdServices: src.householdServices ?? [],
    householdEntries: src.householdEntries ?? [],
    householdPayments: src.householdPayments ?? [],
    householdServiceSettings: src.householdServiceSettings ?? [],
  };
}

export type BackupValidation = { ok: true; backup: BackupFile; warnings: string[] } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isHHMM = (v: unknown): v is string => isStr(v) && HHMM_RE.test(v);
const optStr = (v: unknown) => v === undefined || v === null || isStr(v);

function checkEvent(v: unknown, i: number, errors: string[]): v is CalendarEvent {
  if (!isObj(v)) { errors.push(`Event #${i + 1} is not an object.`); return false; }
  const bad: string[] = [];
  if (!isStr(v.id) || !v.id) bad.push('id');
  if (!isStr(v.title)) bad.push('title');
  if (!isStr(v.date) || !isValidDateKey(v.date)) bad.push('date');
  if (!isBool(v.allDay)) bad.push('allDay');
  if (v.startTime !== undefined && v.startTime !== null && !isHHMM(v.startTime)) bad.push('startTime');
  if (v.endTime !== undefined && v.endTime !== null && !isHHMM(v.endTime)) bad.push('endTime');
  if (!optStr(v.description)) bad.push('description');
  if (!isNum(v.createdAt)) bad.push('createdAt');
  if (!isNum(v.updatedAt)) bad.push('updatedAt');
  if (bad.length) errors.push(`Event #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  // Normalise null -> '' in place (optStr above accepts null, but the editor calls
  // draft.description.trim() on save, which throws on null; the modal's bare catch then swallowed
  // that error, so Save silently did nothing for an event restored from a hand-edited backup).
  if (v.description === null || v.description === undefined) v.description = '';
  return bad.length === 0;
}

function checkNote(v: unknown, i: number, errors: string[]): v is Note {
  if (!isObj(v)) { errors.push(`Note #${i + 1} is not an object.`); return false; }
  const bad: string[] = [];
  if (!isStr(v.id) || !v.id) bad.push('id');
  if (!isStr(v.title)) bad.push('title');
  if (!isStr(v.message)) bad.push('message');
  if (!isBool(v.pinned)) bad.push('pinned');
  if (!isNum(v.createdAt)) bad.push('createdAt');
  if (!isNum(v.updatedAt)) bad.push('updatedAt');
  if (v.displayStart !== undefined && v.displayStart !== null && !(isStr(v.displayStart) && isValidDateKey(v.displayStart))) bad.push('displayStart');
  if (v.displayEnd !== undefined && v.displayEnd !== null && !(isStr(v.displayEnd) && isValidDateKey(v.displayEnd))) bad.push('displayEnd');
  if (bad.length) errors.push(`Note #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  return bad.length === 0;
}

function checkReminder(v: unknown, i: number, errors: string[]): v is Reminder {
  if (!isObj(v)) { errors.push(`Reminder #${i + 1} is not an object.`); return false; }
  const bad: string[] = [];
  if (!isStr(v.id) || !v.id) bad.push('id');
  if (!isStr(v.title)) bad.push('title');
  if (!isStr(v.message)) bad.push('message');
  if (!isStr(v.date) || !isValidDateKey(v.date)) bad.push('date');
  if (!isHHMM(v.time)) bad.push('time');
  if (!isStr(v.repeat) || !REPEAT_RULES.includes(v.repeat as RepeatRule)) bad.push('repeat');
  if (!isBool(v.enabled)) bad.push('enabled');
  if (!(v.lastTriggeredAt === null || isNum(v.lastTriggeredAt))) bad.push('lastTriggeredAt');
  if (!isNum(v.createdAt)) bad.push('createdAt');
  if (!isNum(v.updatedAt)) bad.push('updatedAt');
  if (bad.length) errors.push(`Reminder #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  return bad.length === 0;
}

function checkSchedule(v: unknown, i: number, errors: string[]): v is Schedule {
  if (!isObj(v)) { errors.push(`Schedule #${i + 1} is not an object.`); return false; }
  const bad: string[] = [];
  if (!isStr(v.id) || !v.id) bad.push('id');
  if (!isStr(v.name)) bad.push('name');
  if (!isHHMM(v.startTime)) bad.push('startTime');
  if (!isHHMM(v.endTime)) bad.push('endTime');
  if (!Array.isArray(v.daysOfWeek) || v.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) bad.push('daysOfWeek');
  if (!isStr(v.mode) || !(FRAME_MODES as string[]).includes(v.mode)) bad.push('mode');
  if (!isBool(v.enabled)) bad.push('enabled');
  if (!isNum(v.priority)) bad.push('priority');
  if (bad.length) errors.push(`Schedule #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  return bad.length === 0;
}

function checkPhoto(v: unknown, i: number, errors: string[]): v is PhotoMeta {
  if (!isObj(v)) { errors.push(`Photo #${i + 1} is not an object.`); return false; }
  const bad: string[] = [];
  if (!isStr(v.id) || !v.id) bad.push('id');
  if (!isStr(v.filename)) bad.push('filename');
  if (!isStr(v.mimeType)) bad.push('mimeType');
  if (!isNum(v.createdAt)) bad.push('createdAt');
  if (!isBool(v.favorite)) bad.push('favorite');
  if (!isNum(v.size)) bad.push('size');
  if (bad.length) errors.push(`Photo #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  return bad.length === 0;
}

function checkHouseholdService(v: unknown, i: number, errors: string[]): v is HouseholdService {
  if (!isObj(v)) { errors.push(`Household service #${i + 1} is not an object.`); return false; }
  const required = ['id', 'name', 'type', 'vendorName', 'startDate', 'paymentType', 'status', 'notes'];
  const bad = required.filter((k) => !isStr(v[k]));
  if (!isNum(v.rate)) bad.push('rate');
  if (!isNum(v.createdAt)) bad.push('createdAt');
  if (!isNum(v.updatedAt)) bad.push('updatedAt');
  if (v.endDate !== undefined && !isStr(v.endDate)) bad.push('endDate');
  if (bad.length) errors.push(`Household service #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  return bad.length === 0;
}
function checkHouseholdEntry(v: unknown, i: number, errors: string[]): v is HouseholdDailyEntry {
  if (!isObj(v)) { errors.push(`Household entry #${i + 1} is not an object.`); return false; }
  const bad = ['id', 'serviceId', 'date', 'note'].filter((k) => !isStr(v[k]));
  if (!isNum(v.updatedAt)) bad.push('updatedAt');
  if (v.quantity !== undefined && !isNum(v.quantity)) bad.push('quantity');
  if (v.amount !== undefined && !isNum(v.amount)) bad.push('amount');
  if (bad.length) errors.push(`Household entry #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  return bad.length === 0;
}
function checkHouseholdPayment(v: unknown, i: number, errors: string[]): v is HouseholdPayment {
  if (!isObj(v)) { errors.push(`Household payment #${i + 1} is not an object.`); return false; }
  const bad = ['id', 'serviceId', 'month', 'status', 'note'].filter((k) => !isStr(v[k]));
  for (const k of ['expectedAmount', 'paidAmount', 'updatedAt']) if (!isNum(v[k])) bad.push(k);
  if (bad.length) errors.push(`Household payment #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  return bad.length === 0;
}
function checkHouseholdSettings(v: unknown, i: number, errors: string[]): v is HouseholdServiceSettings {
  if (!isObj(v)) { errors.push(`Household settings #${i + 1} is not an object.`); return false; }
  const bad = ['id', 'serviceId', 'deductionMethod', 'unit'].filter((k) => !isStr(v[k]));
  for (const k of ['customDailyDeduction', 'defaultQuantity']) if (!isNum(v[k])) bad.push(k);
  if (!Array.isArray(v.scheduleDays)) bad.push('scheduleDays');
  if (bad.length) errors.push(`Household settings #${i + 1} has invalid fields: ${bad.join(', ')}.`);
  return bad.length === 0;
}

function checkList<T>(value: unknown, label: string, check: (v: unknown, i: number, errors: string[]) => v is T, errors: string[]): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`"${label}" must be a list.`);
    return [];
  }
  const out: T[] = [];
  const ids = new Set<string>();
  value.forEach((item, i) => {
    if (check(item, i, errors)) {
      const id = (item as { id: string }).id;
      if (ids.has(id)) errors.push(`${label} contains a duplicate id (${id}).`);
      ids.add(id);
      out.push(item);
    }
  });
  return out;
}

/** Validates an untrusted parsed JSON value. Never throws. */
export function validateBackup(json: unknown): BackupValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(json)) return { ok: false, errors: ['The file is not a JSON object.'] };
  if (json.format !== BACKUP_FORMAT) return { ok: false, errors: ['This is not a Smart Family Frame backup file.'] };
  if (!isNum(json.version)) return { ok: false, errors: ['Backup version is missing.'] };
  if (json.version > BACKUP_VERSION) {
    return { ok: false, errors: [`This backup was made by a newer version (v${json.version}). Update the frame software first.`] };
  }
  if (!isObj(json.settings)) errors.push('Settings are missing.');

  const events = checkList(json.events, 'events', checkEvent, errors);
  const notes = checkList(json.notes, 'notes', checkNote, errors);
  const reminders = checkList(json.reminders, 'reminders', checkReminder, errors);
  const schedules = checkList(json.schedules, 'schedules', checkSchedule, errors);
  const photos = checkList(json.photos, 'photos', checkPhoto, errors);
  const householdServices = checkList(json.householdServices, 'householdServices', checkHouseholdService, errors);
  const householdEntries = checkList(json.householdEntries, 'householdEntries', checkHouseholdEntry, errors);
  const householdPayments = checkList(json.householdPayments, 'householdPayments', checkHouseholdPayment, errors);
  const householdServiceSettings = checkList(json.householdServiceSettings, 'householdServiceSettings', checkHouseholdSettings, errors);

  if (errors.length) return { ok: false, errors };

  if (photos.length > 0) warnings.push(`This backup lists ${photos.length} photo(s) by name only. Photo files are not included in V1 backups; add them again from Photos.`);

  const settings = normalizeSettings(json.settings);
  return {
    ok: true,
    warnings,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: isStr(json.exportedAt) ? json.exportedAt : new Date(0).toISOString(),
      frameName: settings.frameName,
      includesPhotoBinaries: false,
      settings,
      events,
      notes,
      reminders,
      schedules,
      photos,
      householdServices,
      householdEntries,
      householdPayments,
      householdServiceSettings,
    },
  };
}

export function parseBackupText(text: string): BackupValidation {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  return validateBackup(json);
}

export function backupFilename(frameName: string, now: Date = new Date()): string {
  const safe = frameName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'frame';
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${safe}-backup-${y}${m}${d}.json`;
}
