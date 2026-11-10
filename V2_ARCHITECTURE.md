# Smart Family Frame V2 — Architecture

V2 adds a cloud sync layer and two new apps on top of the unchanged V1 Frame. This document explains
how the pieces fit together, the data model, and the engineering decisions behind them.

## 1. The big picture

```
        FAMILY MEMBERS
   ┌───────────┬───────────┐
   │           │           │
 Family PWA   (future app)
      │
      ▼
 CLOUD FUNCTIONS (functions/) ──▶ Firestore + Storage + Auth
         │
         ▼
   SYNC ENGINE (src/cloud/, in the Frame app)
         │
         ▼
     IndexedDB (existing V1 stores + 4 new V2 sync stores)
         │
         ▼
     EXISTING V1 UI (unchanged) ──▶ Acer display
```

The Frame is **local-first**. It always renders from IndexedDB. The cloud only ever feeds new items
into IndexedDB through the sync engine — the Frame UI never queries Firestore directly. This is the
same principle FUTURE.md (written before V2 existed) already called for, and V2 follows it exactly.

## 2. Repository layout

The existing Frame app is untouched at the repo root. V2 adds four new top-level things:

```
shared/              Dependency-free TypeScript: V2 domain types + the household calculation engine
                      (canonical copy — see "Why shared/ exists" below)
functions/            Cloud Functions (TypeScript, Node 22, Firebase Functions v2)
family-app/           The Family PWA (React + TypeScript + Vite, its own package.json)
firebase-tests/       Emulator-based Firestore/Storage security rules tests
firestore.rules
storage.rules
firestore.indexes.json
firebase.json         Emulator ports, hosting config, functions predeploy hook
src/cloud/            NEW in the Frame app: sync engine, Firebase adapter, pairing client (see §5)
src/storage/db.ts     DB_VERSION bumped 2 -> 3, four new stores added additively (see §4)
```

A monorepo tool (npm workspaces, Turborepo, etc.) was deliberately **not** introduced — the existing
Frame app's `npm run dev` / `npm run frame` / `npm test` workflow is unchanged and carries zero V2 risk.
Each of `functions/` and `family-app/` is a normal, independent npm project with its own
`package.json`, `node_modules` and scripts (`npm run functions:*` / `npm run family:*` from the root
`package.json` are just thin `npm --prefix` wrappers for convenience).

### Why `shared/` exists

V2 build §42 requires the household calculation engine to never be duplicated between the Frame, the
Family PWA and the cloud. `shared/household/calculations.ts` is now the ONE place those formulas live;
`src/household/householdLogic.ts` (V1) re-exports it verbatim, so every existing caller and test is
unaffected. `shared/types.ts` similarly holds the V2 domain types (`Family`, `CloudFrame`,
`CloudPhoto`, ...) plus structural mirrors of the V1 types the Family PWA also needs
(`CalendarEvent`, `Note`, `Reminder`, the household types) — mirrored rather than imported directly
because `src/types/index.ts` isn't (and shouldn't become) a shared package; TypeScript's structural
typing makes the two forms interchangeable with zero runtime cost.

Cloud Functions cannot import a path outside the `functions/` directory (Firebase only uploads that
one directory on deploy), so `functions/scripts/copy-shared.mjs` copies `shared/` into
`functions/src/shared/` as a build step (`npm run build` in `functions/` runs it automatically).
`functions/src/shared/` is a **build artifact** — gitignored, never hand-edited. The Frame app and
`family-app/` both reference `shared/` directly via a relative path / `@shared/*` alias since Vite
bundles it like any other source file, no build step needed.

## 3. Data model (Firestore)

```
families/{familyId}                          name, ownerUid, timestamps
  members/{uid}                               role (OWNER|MEMBER), displayName, status (ACTIVE|REVOKED)
  albums/{albumId}                            name, createdBy
  photos/{photoId}                            frameId, authorizedDeviceUid, storagePath, uploadedBy, ...

frames/{frameId}                              familyId, ownerUid, deviceUid, name, status, lastSeenAt
  calendarEvents/{id}                         same shape as V1's CalendarEvent
  notes/{id}                                  same shape as V1's Note
  reminders/{id}                              same shape as V1's Reminder
  householdServices/{id}                      same shape as V1's HouseholdService
  householdEntries/{id}                       id = "{serviceId}:{YYYY-MM-DD}" — same convention as V1
  householdPayments/{id}
  householdServiceSettings/{id}
  remoteSettings/current                      whitelisted safe-settings patch (see §6)

users/{uid}                                   uid -> primary familyId pointer (written by claimPairingCode)
pairingCodes/{code}                           6-digit, 10-minute TTL, single-use
whatsappLinkCodes/{code}                      deferred-prototype link-code store
whatsappSenders/{waId}                        deferred-prototype sender mapping
whatsappProcessedMessages/{messageId}         deferred-prototype webhook idempotency ledger
```

**Why calendar/notes/reminders/household live under `frames/{frameId}/...` and not `families/{familyId}/...`:**
V1 has no concept of a family-wide calendar — every physical Frame has its own local calendar, notes,
reminders and household register. V2 keeps that: each Frame's data is its own subcollection. Photos and
albums, by contrast, ARE family-wide (a shared media pool); each photo record still names exactly ONE
destination `frameId` (see §5).

**Why photos target exactly one Frame:** every V2 acceptance test describing multi-frame behavior
("send only to Parents, Living Room receives nothing") is single-destination. Modeling `CloudPhoto` with
a single `frameId` (rather than an array) keeps the security rules a single equality check instead of a
cross-document loop over an array — Firestore rules cannot loop with per-element lookups. Sending one
picture to several Frames creates several `CloudPhoto` docs.

## 4. IndexedDB changes (Frame app)

`DB_VERSION` is bumped from 2 to 3. Four new stores are added, all additive (existing stores/data are
never touched by the upgrade — see `tests/storage.migration.v3.test.ts`):

| Store | Purpose |
| --- | --- |
| `frameIdentity` | Single row: this Frame's stable `frameId`, `deviceUid`, and current family pairing |
| `syncQueue` | Outbox/inbox bookkeeping — currently used for photo-download retry with backoff |
| `cloudPhotoMap` | `cloudPhotoId -> localPhotoId` dedup so a synced photo is never re-downloaded |
| `syncCursors` | Reserved for future incremental-sync cursors per domain |

## 5. The sync engine (`src/cloud/`)

| File | Role |
| --- | --- |
| `env.ts` | Reads `VITE_FIREBASE_*` env vars; `null` if any are missing (cloud optionality — see §8) |
| `firebaseApp.ts` | Lazily `import()`s the Firebase SDK only once something needs it; never throws |
| `frameIdentity.ts` | Generates/persists the stable `FRAME-XXXXXX` id; manages anonymous device auth |
| `pairing.ts` | Calls `createPairingCode`, watches it for a claim, calls `disconnectFrame` |
| `contentSync.ts` | Generic Firestore listener -> local repo/store mirror, used for calendar/notes/reminders/household |
| `photoSync.ts` | Listens for photos targeting this Frame; downloads via Storage; dedups; retries with backoff |
| `settingsSync.ts` | Applies a whitelisted remote-settings patch through the existing `updateSettings()` |
| `heartbeat.ts` | Calls `frameHeartbeat` at most every 5 minutes (cost control) |
| `syncEngine.ts` | Orchestrates all of the above; reflects status into `remoteSharingStore` for the UI |

Every listener writes through the **existing** V1 repository + store for that domain
(`src/storage/repositories.ts`, `src/app/stores.ts`) — a synced calendar event becomes a completely
normal local `CalendarEvent` the existing `CalendarPage` renders, and a synced reminder is picked up by
the existing reminder engine (`useReminderEngine`) with no changes to either. No second "remote" data
path was created anywhere.

**Direction:** cloud → Frame only. A family member acts through the Family PWA, and the Frame receives it. V1
Frame-authored edits are not currently pushed back to the cloud — the `syncQueue` outbox store exists
for that as a documented near-term extension (see V2_SYNC.md §"What's not built yet").

## 6. Cloud Functions (`functions/`)

All sensitive/privileged operations go through a Cloud Function (Admin SDK, bypasses security rules,
does its own permission checks) rather than a direct client write:

| Function | Trigger | Purpose |
| --- | --- | --- |
| `createPairingCode` | callable, Frame | Self-registers the frame doc, mints a 6-digit pairing code |
| `claimPairingCode` | callable, family user | Atomically consumes a code; creates or joins a family (see V2_SYNC.md for the branching logic) |
| `revokeMember` | callable, OWNER | Marks a member REVOKED |
| `disconnectFrame` | callable, OWNER | Clears a Frame's family association |
| `createPhotoRecord` | callable, family member | Creates the Firestore metadata doc after a client Storage upload |
| `confirmPhotoSynced` | callable, Frame | Marks a photo synced once the Frame has it locally |
| `updateFrameSettings` | callable, OWNER | Writes a whitelisted safe-settings patch |
| `frameHeartbeat` | callable, Frame | Updates `lastSeenAt`, server-throttled to once per ~4 minutes |
| `getHouseholdSummary` | callable, family member | Computes via the shared calculation engine; strips financial fields for non-owners |
| `createWhatsAppLinkCode` | callable, family member | Deferred WhatsApp-prototype support only |
| `whatsappWebhook` | HTTPS | Deferred Meta webhook prototype only |

## 7. WhatsApp (`functions/src/whatsapp/`)

WhatsApp is a deferred prototype, not a supported input channel. Its isolated implementation remains in
the repository for future work; the Family PWA is the supported way to send photos and updates.

## 8. Cloud optionality

This is non-negotiable (V2 build §11) and is verified by `tests/cloud.optionality.test.ts`: with no
`.env` file (the default state), `getCloudConfig()` returns `null`, `getCloudServices()` resolves to
`null` instead of throwing, and `startSyncEngine()` sets status `not_configured` and returns cleanly.
Every function in `src/cloud/` follows the same rule — resolve to `null`/log a warning, never throw out
to a caller that could crash Frame Mode.

## 9. Hardware independence

Nothing in V2 assumes macOS or the Mac prototype. The sync engine runs in the same browser context as
the rest of the Frame app; when V3 moves to an ARM board (FUTURE.md §3), the sync engine needs no
changes — only `DisplayController`'s implementation changes, exactly as FUTURE.md already planned.
