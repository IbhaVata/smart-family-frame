# Smart Family Frame V2 — Security

## Threat model

Two kinds of authenticated caller ever reach the cloud backend:

1. **A family user** (Google or email-link sign-in on the Family PWA), identified by their Firebase Auth
   uid — the same id as their document under `families/{familyId}/members/{uid}`.
2. **A Frame device** (anonymous Firebase Auth from the Frame app), identified by `frames/{frameId}.deviceUid`
   matching the caller's uid. A Frame has no other identity — it never has a password, an email, or any
   human-facing credential.

Every *sensitive* write (creating a family or frame, pairing, revoking a member, creating a photo
record, pushing remote settings, WhatsApp linking) goes through a **Cloud Function** using the Admin
SDK, which bypasses Firestore/Storage security rules entirely and does its own caller-permission checks
in code (`functions/src/lib/auth.ts`'s `requireUid` / `requireActiveMember` / `requireOwner` /
`requireFrame`). Firestore/Storage security rules (`firestore.rules`, `storage.rules`) therefore mainly
gate **reads**, plus the handful of writes deliberately delegated to direct client access: albums,
calendar/notes/reminders, and household quick-entries.

## Firestore rules structure

| Collection | Who can read | Who can write |
| --- | --- | --- |
| `users/{uid}` | that user only | Cloud Functions only |
| `families/{familyId}` | active members of that family | rename: owner only; everything else: Cloud Functions |
| `families/{familyId}/members/{uid}` | active members, or the family's own Frame device (via `frameDeviceIndex`) | Cloud Functions only |
| `families/{familyId}/albums/{albumId}` | active members | active members (create/rename), owner or creator (delete) |
| `families/{familyId}/photos/{photoId}` | active members, or the one Frame device the photo targets | Cloud Functions create/update; owner or uploader delete |
| `frames/{frameId}` | the Frame's own device, or active members of its family | Cloud Functions only |
| `frames/{frameId}/calendarEvents\|notes\|reminders\|householdEntries` | the Frame device or active members | active members |
| `frames/{frameId}/householdServices\|householdServiceSettings\|householdPayments` | the Frame device or the **owner** only | owner only |
| `frames/{frameId}/remoteSettings/current` | the Frame device or active members | Cloud Functions only |
| `pairingCodes/{code}` | only the Frame that generated it | Cloud Functions only |
| `whatsappLinkCodes`, `whatsappSenders`, `whatsappProcessedMessages`, `frameDeviceIndex` | nobody directly | Cloud Functions only |

Every rule above is exercised by `firebase-tests/firestore.rules.test.ts` (48 tests) and
`firebase-tests/storage.rules.test.ts`, run against the real Firestore/Storage emulators — see
`npm run test:rules` from the repo root. These are not just `get()`-by-id tests: a `list`/query
regression suite is included specifically because — see "Lessons from live testing" below — a `list`
query is evaluated differently than a `get` of one known document.

## Household privacy (§43)

Full financial detail (service rates, payment records) is **owner-only**, both read and write. A plain
member can read and write day-to-day attendance/delivery entries (`householdEntries`) but not the
service definitions or payment history. **One documented limitation**: `householdEntries` can carry a
per-entry `amount` for `PER_UNIT`/`CUSTOM` services, and that collection is member-open (members need it
for quick actions), so a member could in principle see one entry's amount. A fully field-level split
(separating the amount into an owner-only sub-document) is a reasonable future refinement but wasn't
judged worth the added complexity for V1 of V2. The Family PWA's `getHouseholdSummary` Cloud Function
already strips amounts/payment info server-side for non-owners in its own response, independent of this
rule — see V2_ARCHITECTURE.md §6.

## Photo authorization model

- Storage path: `families/{familyId}/photos/{frameId}/{photoId}.{ext}` — the destination frame is part
  of the path itself, so Storage rules can authorize a download with one cheap lookup rather than first
  reading the photo's Firestore metadata.
- Firestore's `CloudPhoto.authorizedDeviceUid` is a **denormalized** copy of the target frame's
  `deviceUid`, written once by `createPhotoRecord`/`whatsappWebhook` (both funnel through
  `createPhotoRecordInternal`). This exists so a Frame's photo-sync listener never needs to cross-read
  `frames/{frameId}` for every photo — see "Lessons from live testing" for why a naive version of this
  check (`resource.data.authorizedDeviceUid` in a `list` query) had to be reworked.
- Storage rules independently validate MIME type (`image/jpeg|png|webp`) and size (≤ 15 MB) on upload,
  and deny any overwrite of an existing object (`resource == null` check) — photos are immutable once
  stored.
- Cross-service rules: `storage.rules` calls `firestore.get(...)` to check family membership / frame
  ownership. This requires Storage and Firestore to be the same project's default database, true for
  every setup this repo documents.

## WhatsApp-specific security

- **Signature verification**: every webhook POST's `X-Hub-Signature-256` (HMAC-SHA256 over the raw body
  with the Meta App Secret) is checked with a constant-time comparison (`timingSafeEqual`) before
  anything in the body is parsed or trusted.
- **Idempotency**: each Meta message id is claimed via an atomic Firestore `create()` (fails if the
  document already exists) before any side effect runs — a retried delivery is a safe no-op.
- **Unknown senders** get a generic rejection that never reveals a Frame id, family name, or any other
  detail (§54) — the only way an unlinked number can do anything is send `LINK <code>`.
- **Secrets never reach the browser**: the Meta access token, app secret and webhook verify token are
  Firebase Functions params read from `functions/.env.<project-id>` (gitignored, plain text on disk —
  not Secret Manager, so deploy does not require Cloud Billing), referenced only from
  `functions/src/whatsapp/config.ts`. They are never included in the Family PWA or Frame app's client
  bundles.

## Cloud optionality as a security/reliability property

`tests/cloud.optionality.test.ts` verifies that with no Firebase config, `getCloudConfig()` returns
`null`, `getCloudServices()` resolves to `null` instead of throwing, and `startSyncEngine()` degrades to
a `not_configured` status and returns cleanly. This matters for security too: a Frame that can't reach
Firebase (network down, misconfigured project, revoked credentials) must never enter an undefined or
crashed state — it just keeps serving its local data, exactly as V1 always did.

## Lessons from live testing (why some rules look the way they do)

Running the Frame and Family PWA against real Firebase emulators (Auth + Firestore + Storage +
Functions), not just unit tests, surfaced three real Firestore rules bugs that unit tests alone did not
catch — each is now covered by a permanent regression test:

1. **`allow list: if false` silently breaks every `query(...)` a client actually runs**, even when
   `allow get` is fine. The Family PWA's "list this family's frames" screens returned nothing (not an
   error) until this was found — see `frames/{frameId}`'s rule and
   `firebase-tests/firestore.rules.test.ts`'s "list/query operations" suite.
2. **`get(path) != null` does not safely guard a possibly-missing document.** `get()` on a non-existent
   document does not return `null`; accessing `.data` on the result throws, and that throw propagates
   out of `||` instead of just making that one operand `false` — denying a read that a LATER operand
   would have allowed. The fix is `exists(path)` as an explicit guard before ever touching `.data`. This
   mattered because a Frame's own device identity is legitimately never a family member (no
   `families/{id}/members/{deviceUid}` document exists for it), so `isActiveFamilyMember` needed to
   cleanly evaluate `false` for it rather than throwing.
3. **Reading a `resource.data` field that isn't part of the query's own `where` filter is unreliable
   during `list` evaluation** in the emulator — `resource.data.authorizedDeviceUid` reproducibly threw
   "Property authorizedDeviceUid is undefined" for the Frame's photo-sync query (filtered only on
   `frameId`) even though the real matching document had that field set. The fix was to stop depending on
   that denormalized field for the READ rule and cross-check via `get()` against the frame doc instead
   (the same proven pattern every sibling subcollection already used) — `authorizedDeviceUid` is still
   written and still used by Storage rules and `confirmPhotoSynced`, just not read directly inside a
   `list` rule anymore.

See `firestore.rules`'s inline comments at each fix site for the specific reasoning, and
`firebase-tests/firestore.rules.test.ts`'s "list/query operations" describe block for the regression
tests that would catch a reintroduction of any of these three.
