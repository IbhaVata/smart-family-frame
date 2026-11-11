/**
 * V2 cross-cutting domain types: shared by the Frame app (src/), the Family PWA (family-app/) and
 * Cloud Functions (functions/, via a build-time copy — see functions/scripts/copy-shared.mjs).
 *
 * Kept free of any runtime dependency (no React, no `idb`, no Firebase SDK, no DOM globals) so it can
 * be imported unmodified by a browser bundle, a Node Cloud Function, or a Vitest test. The household
 * types here are STRUCTURALLY IDENTICAL to src/types/index.ts's household types on purpose: V1 objects
 * flow into shared/household/calculations.ts without any conversion, by TypeScript structural typing.
 */

/* ============================== Family / membership ============================== */

export type FamilyRole = 'OWNER' | 'MEMBER'; // 'VIEWER' reserved for a future phase
export type MemberStatus = 'ACTIVE' | 'REVOKED';

export interface Family {
  id: string;
  name: string;
  ownerUid: string;
  createdAt: number;
  updatedAt: number;
}

export interface FamilyMember {
  uid: string;
  role: FamilyRole;
  displayName: string;
  photoURL?: string;
  status: MemberStatus;
  joinedAt: number;
  updatedAt: number;
}

/* ============================== Frames ============================== */

export type CloudFrameStatus = 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR';

/**
 * The cloud-side record at `frames/{frameId}`. Status is informational only — never an auth gate.
 * `familyName` is a deliberate denormalization of `families/{familyId}.name`: the Frame's own device
 * identity is never a family member, so Firestore rules correctly deny it reading `families/{familyId}`
 * directly (only human members may). Copying the name onto the frame doc (kept in sync by
 * `claimPairingCode`, the only place a frame's family association changes) lets the Frame learn its
 * family's name from a document it's always allowed to read — its own.
 */
export interface CloudFrame {
  frameId: string;
  familyId: string;
  familyName: string | null;
  name: string;
  ownerUid: string;
  deviceUid: string;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  softwareVersion: string;
  status: CloudFrameStatus;
}

/** A safe, whitelisted subset of Settings an OWNER may push remotely. Never arbitrary fields. */
export const SAFE_REMOTE_SETTINGS_KEYS = ['photoIntervalSec', 'shuffle', 'defaultMode', 'showHouseholdOnFrame'] as const;
export type SafeRemoteSettingsKey = (typeof SAFE_REMOTE_SETTINGS_KEYS)[number];
export type RemoteSettingsPatch = Partial<Record<SafeRemoteSettingsKey, unknown>> & { updatedAt: number; updatedBy: string };

/**
 * `frameDeviceIndex/{deviceUid}` — a reverse index from a Frame's device uid to its family, kept in
 * sync by pairing.ts alongside the frame doc's own familyId. Exists purely so Firestore security rules
 * can answer "is this caller device a Frame belonging to family X?" with a single indexed get() instead
 * of an unsupported "does any frame with this familyId have this deviceUid" scan — needed for the
 * Frame's own Settings screen to read its family's member list (§19), since a Frame device is never
 * itself a family member.
 */
export interface FrameDeviceIndexEntry {
  deviceUid: string;
  frameId: string;
  familyId: string;
}

/* ============================== Pairing & WhatsApp linking ============================== */

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const WHATSAPP_LINK_CODE_TTL_MS = 10 * 60 * 1000;
/** Family invite links are shared over WhatsApp and may be opened days later. The token is long and
 *  random (not a 6-digit code), so a longer life does not make it guessable. */
export const FAMILY_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface FamilyInvite {
  token: string;
  familyId: string;
  familyName: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  expiresAt: number;
}

export interface PairingCode {
  code: string;
  frameId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  usedBy?: string;
  usedAt?: number;
}

export interface WhatsAppLinkCode {
  code: string;
  uid: string;
  familyId: string;
  displayName: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

/** `whatsappSenders/{waId}` — waId is the sender's WhatsApp phone number (E.164, no '+'). */
export interface WhatsAppSender {
  waId: string;
  uid: string;
  familyId: string;
  displayName: string;
  defaultFrameId: string | null;
  linkedAt: number;
  updatedAt: number;
}

/* ============================== Photos & albums ============================== */

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB upload cap (post client-side optimization)
export const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_MAX_DIMENSION = 2560; // matches FUTURE.md's phone-upload target

export type PhotoSyncStatus = 'pending' | 'synced';
export type PhotoSource = 'pwa' | 'whatsapp';

export interface CloudAlbum {
  id: string;
  familyId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

/**
 * `families/{familyId}/photos/{photoId}`. Each send targets exactly ONE destination Frame (the Family
 * PWA's Send Photos flow and every V2 acceptance test — e.g. "send only to Parents, Living Room
 * receives nothing" — are single-destination); sending the same picture to several Frames creates
 * several CloudPhoto docs, one per Frame. This keeps both the data model and the security rules simple:
 * a photo doc names exactly one authorized Frame device, checkable with a single equality comparison
 * instead of a cross-document loop over an array.
 */
export interface CloudPhoto {
  photoId: string;
  familyId: string;
  frameId: string;
  /** Denormalized copy of `frames/{frameId}.deviceUid`, written once by `createPhotoRecord`. Lets the
   *  Firestore/Storage read rules do a single cheap equality check instead of a cross-document lookup
   *  per request. Storage path is `families/{familyId}/photos/{frameId}/{photoId}.{ext}` for the same reason. */
  authorizedDeviceUid: string;
  albumId: string | null;
  storagePath: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: number;
  source: PhotoSource;
  syncStatus: PhotoSyncStatus;
  /** Set once the target frame has confirmed local download; used by future retention cleanup. */
  downloadConfirmedAt?: number;
}

/* ============================== Remote calendar / notes / reminders ============================== */
/* Each Frame owns its own subcollections under frames/{frameId}/... — this mirrors V1, where every
   physical Frame has its own local calendar/notes/reminders (no cross-frame sharing in V1). The types
   below are STRUCTURALLY IDENTICAL to src/types/index.ts's V1 types (same reasoning as the household
   types further down): the Family PWA reads/writes these same shapes directly against Firestore, and
   the Frame's contentSync.ts mirrors them into the SAME local repositories V1 already uses. */

export interface RemoteAttribution {
  createdBy: string;
  createdByName: string;
}

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
  lastTriggeredAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/* ============================== Sync bookkeeping (local, IndexedDB-side) ============================== */

export type SyncDomain = 'photo' | 'event' | 'note' | 'reminder' | 'household' | 'settings';
export type SyncOp = 'create' | 'update' | 'delete';
export type SyncQueueStatus = 'pending' | 'syncing' | 'failed' | 'done';

/** A local outbox entry (frame -> cloud) or inbox-processing marker; both use the same shape. */
export interface SyncQueueItem {
  id: string;
  domain: SyncDomain;
  op: SyncOp;
  direction: 'outbox' | 'inbox';
  payload: unknown;
  attempts: number;
  lastError?: string;
  status: SyncQueueStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CloudPhotoMap {
  /** Missing on legacy imports; adopted by the current TV on its first authoritative sync. */
  familyId?: string;
  frameId?: string;
  cloudPhotoId: string;
  localPhotoId: string;
  syncedAt: number;
}

export interface FrameIdentity {
  key: 'device';
  frameId: string;
  deviceUid: string | null;
  createdAt: number;
  familyId: string | null;
  familyName: string | null;
  pairedAt: number | null;
}

export interface SyncCursor {
  domain: SyncDomain;
  lastSyncedAt: number;
}

/* ============================== Household (mirrors src/types/index.ts exactly) ============================== */

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
